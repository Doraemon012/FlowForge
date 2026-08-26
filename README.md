# FlowForge

FlowForge is a Go service for distributed workflow orchestration. The repository currently contains **Phase 6**: the Phase 1 foundation, Phase 2 authentication/project ownership, Phase 3 workflow definitions/versioning, Phase 4 durable executions, Phase 5 the durable PostgreSQL queue with independent workers, and Phase 6 fault-tolerant leases/heartbeats/recovery. Scheduling, webhooks, and dashboard functionality are planned for later phases and are not implemented yet.

## Prerequisites

- Go 1.24+
- Docker and Docker Compose

## Start PostgreSQL

```sh
docker compose up -d postgres
```

Wait until the service is healthy:

```sh
docker compose ps
```

## Configure the service

```sh
cp .env.example .env
set -a
. ./.env
set +a
```

`.env` is local-only and ignored by git. Replace `TOKEN_SECRET` with at least 32 random characters for local use. Do not put real credentials in the repository.

## Run migrations

```sh
go run ./cmd/migrate
```

The migration command uses goose and is safe to run again against the same database.

## Start FlowForge

In another terminal, load the same environment and start the service:

```sh
set -a
. ./.env
set +a
go run ./cmd/flowforge
```

The server listens on `HTTP_ADDR`, which defaults to `:8080` in `.env.example`.

## Verify health

```sh
curl -i http://localhost:8080/health
```

With PostgreSQL available, the endpoint returns HTTP `200` and a JSON body showing both service and database health. If PostgreSQL becomes unavailable, it returns HTTP `503` with a degraded status.

## Run tests

Unit tests run without external services:

```sh
go test ./...
```

PostgreSQL integration tests run when `INTEGRATION_DATABASE_URL` is set. For the local Compose database:

```sh
INTEGRATION_DATABASE_URL="$DATABASE_URL" go test ./...
```

The integration suite verifies migrations, migration reruns, database connectivity, User persistence, and the real database-backed health path.

## Authentication and projects

Register a user:

```sh
curl -X POST http://localhost:8080/api/v1/auth/register \
	-H 'Content-Type: application/json' \
	-d '{"email":"you@example.com","display_name":"You","password":"correct horse battery staple"}'
```

Use the returned `access_token` as a bearer token to create and manage owned projects:

```sh
curl -X POST http://localhost:8080/api/v1/projects \
	-H "Authorization: Bearer <access_token>" \
	-H 'Content-Type: application/json' \
	-d '{"name":"My Project"}'
```

Project endpoints reject unauthenticated requests and cannot be used to access another user's projects.

## Workflows and versions

Create and manage a workflow with a structured definition. Each task has an `id`, one of the fixed built-in types (`http`, `transform`, `delay`, `conditional`, or `email`), a JSON-object `config`, and optional `depends_on` task IDs. A workflow is stored as an editable draft. Publishing validates the DAG and creates an immutable numbered version.

```sh
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows \
	-H "Authorization: Bearer <access_token>" \
	-H 'Content-Type: application/json' \
	-d '{"name":"Example","description":"A draft","definition":{"tasks":[{"id":"start","type":"transform","config":{}},{"id":"finish","type":"delay","config":{"seconds":1},"depends_on":["start"]}]}}'
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows/<workflow_id>/validate \
	-H "Authorization: Bearer <access_token>"
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows/<workflow_id>/versions \
	-H "Authorization: Bearer <access_token>"
```

Editing the draft after publication does not change an existing version.

## Executions

Start an execution from a published version:

```sh
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows/<workflow_id>/executions \
	-H "Authorization: Bearer <access_token>" \
	-H 'Content-Type: application/json' \
	-d '{"version_id":"<version_id>","input":{}}'
```

The API returns `202 Accepted` and persists execution/task status while the engine evaluates the DAG. Phase 4 established the execution semantics; Phase 5 routes runnable work through the durable PostgreSQL queue and independent workers. Phase 6 makes distributed execution fault tolerant: bounded task leases with heartbeats, expired-lease recovery by any live worker, fenced results that reject stale workers, append-only attempt history, and bounded retries (3 attempts before terminal failure).

Phase 5 runs task execution in independent worker processes. Start two workers in separate terminals (use a different `WORKER_ID` for each):

```sh
WORKER_ID=worker-1 go run ./cmd/worker
WORKER_ID=worker-2 go run ./cmd/worker
```

Workers claim durable queued task runs under a bounded lease (10s by default), renew it with heartbeats (2s interval), execute under a cancellable context, and persist results through the fenced queue path. If a worker dies mid-task, its lease expires and another live worker reclaims and re-runs the task — at-least-once semantics; after 3 lost workers the task fails terminally. Every attempt is recorded in `task_attempts`. Work remains in PostgreSQL while workers are stopped. Timing is tunable per process with `WORKER_LEASE_DURATION`, `WORKER_HEARTBEAT_INTERVAL`, and `WORKER_RECOVERY_INTERVAL` (see `.env.example`; heartbeat must stay below lease duration).
