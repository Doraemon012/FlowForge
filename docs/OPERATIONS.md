# FlowForge Operations & Runbook

This document is the V1 operational reference for running, migrating, backing up, recovering, and troubleshooting FlowForge. It complements `SECURITY.md` (threat model) and `TESTING.md` (verification strategy).

## Architecture at a glance

FlowForge is a Go service with three processes and one shared PostgreSQL database:

- `cmd/flowforge` — HTTP control plane: authentication, projects, workflows, executions, schedules, webhooks, observability endpoints, and the in-process execution orchestrator.
- `cmd/worker` — independent task runner. One or more workers claim queued task runs under a bounded lease, execute them, and record attempts/results. Workers also sweep for expired leases left by dead workers.
- `cmd/migrate` — applies Goose database migrations.

The only external dependency for V1 is PostgreSQL. There is no in-memory queue; all durable state lives in Postgres.

## Prerequisites

- Go 1.24+
- Docker Compose (for the local Postgres and reference deployment)
- PostgreSQL 14+ (16 is used in the reference `docker-compose.yml`)

## Deployment

### 1. Start PostgreSQL

```sh
docker compose up -d postgres
```

Wait for the service to be healthy:

```sh
docker compose ps
```

### 2. Configure the service

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` — PostgreSQL connection URL.
- `HTTP_ADDR` — control-plane listen address (default `:8080`).
- `TOKEN_SECRET` — at least 32 random characters; keep it private.
- `DB_CONNECT_TIMEOUT` — connection timeout (default `5s`).
- `WORKER_ID` — unique worker identity (only used by the worker process).
- Optional worker tuning:
  - `WORKER_LEASE_DURATION` (default `10s`)
  - `WORKER_HEARTBEAT_INTERVAL` (default `2s`)
  - `WORKER_RECOVERY_INTERVAL` (default `1s`)

The heartbeat interval must be comfortably below the lease duration, otherwise a healthy worker can lose its own lease.

```sh
cp .env.example .env
set -a
. ./.env
set +a
```

### 3. Run migrations

```sh
go run ./cmd/migrate
```

Migrations are idempotent: rerunning against an already-migrated database is a no-op.

### 4. Start the control plane

```sh
go run ./cmd/flowforge
```

### 5. Start workers

Run one worker per terminal. Each must use a distinct `WORKER_ID`:

```sh
WORKER_ID=worker-1 go run ./cmd/worker
WORKER_ID=worker-2 go run ./cmd/worker
```

The control plane and workers are separate processes; the API never executes task code itself. A scheduled or webhook-triggered execution is orchestrated by the in-process engine, which enqueues runnable tasks for workers to claim.

### 6. Verify

```sh
curl -i http://localhost:8080/health
```

A healthy deployment returns `200` with `{"status":"ok","database":"ok"}`. If PostgreSQL is unavailable, it returns `503`.

## Migrations

Migrations live in `internal/db/migrations/` and are applied with the `cmd/migrate` binary, which wraps [Goose](https://github.com/pressly/goose).

### Apply

```sh
go run ./cmd/migrate
```

### Rollback a single migration (preview)

A migration's `Down` block determines the rollback semantics. For example, `00013_add_task_retry_backoff.sql` removes the `not_before` column when rolled back. Review each `Down` block before applying a rollback in production.

```sh
goose -dir internal/db/migrations -table goose_db_version postgres "$DATABASE_URL" down
```

> Treat rollback as a controlled, pre-reviewed operation, not a routine response to a bad deploy.

### Rehearsal

Before a release, validate the full set of migrations from a clean database and then re-run to confirm idempotency:

```sh
docker compose down -v
docker compose up -d postgres
go run ./cmd/migrate
go run ./cmd/migrate   # second run must be a no-op
```

## Backup and restore

### Backup

Use `pg_dump` to capture both schema and data:

```sh
pg_dump "$DATABASE_URL" -Fc -f flowforge.dump
```

Store dumps in an access-controlled location. For V1, a scheduled `pg_dump` at least daily is recommended.

### Restore

```sh
pg_restore --clean --if-exists -d "$DATABASE_URL" flowforge.dump
go run ./cmd/migrate
```

### Restore rehearsal

Backups are only trustworthy if a restore has been exercised:

1. Create a scratch database.
2. `pg_restore` the dump into it.
3. Run `go run ./cmd/migrate` to bring it to the current version.
4. Start the control plane against it and confirm `/health` returns `200` and an existing execution is queryable.

V1 requires at least one documented, successful backup/restore rehearsal per release.

## Retention

For V1 the database is the source of truth and no automatic retention job is enabled by default. The following tables grow with use and should be bounded by operational policy or a scheduled cleanup job before V1 ships to a public tenant:

- `execution_events` — lifecycle events.
- `log_entries` — persisted structured logs.
- `task_attempts` — append-only attempt history.
- `execution_idempotency` — idempotency keys.

Recommended retention policy: keep the last 30 days of `execution_events`, `log_entries`, and `task_attempts`, and prune `execution_idempotency` rows older than 30 days (or once an execution is terminal). Cleanup is a scheduled, low-frequency maintenance job; it must never run concurrently with an active worker recovery sweep in a way that locks long-lived rows.

Retention is deliberately not embedded in the request path; it must be an explicit offline operation so a misconfigured cleanup cannot affect live traffic.

## Resource and rate limits

The control plane applies the following limits (see `.env.example` for configuration):

- Request body size limit: `MAX_BODY_BYTES` (default `1 MiB`). Requests larger than this are rejected with `413`.
- Rate limiting by client IP on authentication endpoints and the public webhook endpoint, using a token-bucket limiter (see `internal/httpapi/limits.go`). Limits are configurable via `AUTH_RATE_LIMIT_RPS` / `AUTH_RATE_LIMIT_BURST` and `WEBHOOK_RATE_LIMIT_RPS` / `WEBHOOK_RATE_LIMIT_BURST`.

Rate limits protect the control plane from credential stuffing and webhook replay storms. They are per-process; a multi-instance deployment behind a load balancer should place a shared limiter at the edge (e.g., an API gateway or `nginx` `limit_req`) or accept per-instance limits.

## Failure runbooks

### Worker crashes mid-task

A worker holds a bounded lease on its claimed task. If it dies:

1. The lease expires after `WORKER_LEASE_DURATION` (default `10s`).
2. Any live worker's recovery sweep marks the attempt `worker_lost` (classified `transient`) and returns the queue row and task to `queued`.
3. A worker re-claims the task, creating a new attempt.
4. After `maxAttempts` (default `3`) lost attempts, the task is marked terminal `failed` and dependents block.

Expected behavior: at-least-once delivery. A task may run more than once; side effects must be idempotent.

### Control plane restarts with in-flight executions

On startup, the control plane lists active (`pending`/`running`) executions and re-starts their orchestrator loops. Queued tasks are already durable and are re-claimed by workers on their own. No manual intervention is required.

### PostgreSQL becomes unavailable

- `/health` returns `503`.
- New API mutations fail.
- Workers retry heartbeats and fail the task only if the lease truly expires.
- Do not restart the database with `docker compose down -v` unless you intend to lose data.

After the database returns, workers re-claim expired work and the in-process orchestrator reconciles active executions.

### A webhook or schedule fires more than once

Idempotency keys are reserved atomically with execution creation (`CreateOwnedWithIdempotency`). The same delivery ID / scheduled occurrence cannot create two executions. The scheduler advances a schedule to the next occurrence only when the current occurrence was the one processed (`AdvanceOccurrence` is conditional), preventing double-skipping under concurrent ticks.

### A task fails transiently (e.g. HTTP 5xx)

The worker classifies retryable errors as `transient` and calls `FailClassified`. The queue schedules a retry with exponential backoff (`retryBackoff`) and a `not_before` delay so it is not re-claimed immediately. After `maxAttempts`, the task fails terminally.

## Security operations checklist

- Use TLS for external and worker communication (reverse-proxy or managed endpoint).
- Use a least-privilege database role for the application; do not run the app as a Postgres superuser.
- Inject `TOKEN_SECRET` and any provider secrets through the deployment environment, never through the codebase.
- Run `govulncheck ./...` in CI and before each release.
- Review every migration before applying it, especially `Down` blocks.
- Back up the database and rehearse a restore before each release.
- Never expose internal stack traces or credentials in API responses.

## Observability

The control plane exposes:

- `GET /health` — service and database liveness.
- `GET /metrics` — dashboard view of queues, workers, and execution counts.
- `GET /executions/{executionID}/events` — lifecycle events.
- `GET /executions/{executionID}/logs` — persisted structured logs.
- `GET /executions/{executionID}/attempts` — attempt history.
- `GET /workers` — registered workers.
- `GET /queue` — queue metrics.

Structured logs are emitted as JSON to stdout. Redaction is handled by structured field policy; never log credential material.

## Related documents

- `docs/SECURITY.md` — threat model and security requirements.
- `docs/TESTING.md` — verification and test gates.
- `docs/OBSERVABILITY.md` — observability model.
- `README.md` — quick start.
