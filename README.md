# FlowForge

FlowForge is a Go service and React dashboard for distributed workflow orchestration. It executes versioned directed acyclic graphs (DAGs) of tasks asynchronously through a durable PostgreSQL-backed queue and independently running workers, with bounded leases, heartbeats, retries, and recovery. The current build is a runnable V1 implementation in active hardening, not a frozen release.

## What is implemented

- **Authentication & ownership (Phases 1–2):** email/password registration and login with bcrypt password hashes, short-lived bearer tokens, and single-owner project isolation. Every project-owned resource is authorized by the caller's ownership.
- **Workflow definitions (Phase 3):** draft definitions, DAG validation (cycles, unknown dependencies, duplicate IDs, unsupported types, size limits), immutable published versions, and activate/deactivate.
- **Execution engine (Phase 4):** persisted execution and task-run state, dependency gating, parallel branch scheduling, terminal transitions, and idempotency guards.
- **Durable queue & workers (Phase 5):** PostgreSQL-backed task queue with atomic claiming (`FOR UPDATE SKIP LOCKED`), independent worker processes, and concurrent independent task execution.
- **Reliability & recovery (Phase 6):** bounded task leases, heartbeats, lease expiry detection, fencing (stale results are rejected), append-only attempt history, retry policy with exponential backoff, timeout handling, and cooperative cancellation on lease loss.
- **Triggers (Phase 7–8):** manual/API triggers, signed webhooks with replay/timestamp protection, and a scheduler with timezone handling, missed-occurrence policy, and duplicate-suppression via atomic idempotency keys.
- **V1 task set (Phase 9):** built-in `http`, `transform`, `delay`, `conditional`, and `email` task types behind a stable task contract, credential references with redaction, object-storage artifact references, and safe input/output limits.
- **Observability (Phase 10):** structured JSON logs, append-only lifecycle events, persisted log entries, attempt history, worker/queue/metrics views, and project-isolated observability endpoints.
- **Workflow review (advisory):** the `validate`, AI generate, and AI edit endpoints return non-blocking review warnings for definitions that are valid but probably wrong — placeholder values, credentials pasted inline instead of referenced, non-idempotent HTTP retries, and unconnected tasks. The builder shows them before a run. Review never blocks saving, publishing, or running.

- **Execution-to-builder debug loop:** a failed run names the task that failed and why. The execution detail page derives a run diagnosis from the task runs and the exact version that ran — the root-cause task, what it blocked, and which tasks never ran — and every failure (on the execution detail page and the executions list) deep-links straight into the builder with the offending task selected, so you can fix the configuration and re-run.
- **Run recovery:** an active run can be stopped from the execution detail page or the executions list with **Cancel run**; once a run settles, **Run again** starts a new execution of the exact same version and input, so a fix can be verified against the data that failed. Cancelling stops work that has not started and cancels an in-flight task, and a late result from the interrupted attempt is rejected so a cancelled run cannot resume.
- **Starter templates:** the workflow empty states, the project overview, and the new-workflow page offer ready-made runnable examples (fetch-and-notify, status guard, scheduled digest, webhook relay). Choosing one creates an ordinary workflow with that definition already loaded — the same request a user could make by hand — so a new user can run a real pipeline without designing a task graph first.
- **Version and change comparison:** the Versions page can compare a published version against the previous one and shows the task-level changes — which tasks were added, removed, or changed, and how each changed field (type, config, dependencies) moved. The AI assistant preview shows the same field-level diff between the current graph and its proposed change before you apply it.

The result is an at-least-once distributed execution system: a task may run more than once when completion is ambiguous, so side-effecting tasks use a deterministic idempotency key where the external system supports it. The frontend currently focuses on the core build, run, and inspect journey; scheduling/webhook administration and broader operational dashboards remain follow-up work.

## Product workflow

The normal user journey is:

1. Open the frontend, register or log in, and create a project.
2. Create a workflow — either from a ready-made starter template or from a blank canvas — add tasks from the palette, connect dependencies, and configure each selected task in the inspector.
3. Save the draft, then use **Validate** to check the DAG and task configuration. **Publish** creates an immutable version and activates it for new runs.
4. Press **Run**. FlowForge returns an execution immediately; the control plane queues eligible tasks and a worker claims them.
5. Follow the execution detail page. It polls the persisted workflow status, task status, outputs, failures, attempt history, worker assignments, lifecycle events, and worker logs. Refreshing the page reads the same durable records. A failed run is explained in place: the diagnosis names the root-cause task, what it blocked, and what never ran, and links into the builder at that task to fix and re-run.

The API and worker are separate processes. A run can remain queued until at least one worker is running.

### Built-in task types

- **Transform:** emits the configured JSON output, or passes its input through when no output is configured.
- **Delay:** waits for the configured number of seconds and passes its input through.
- **Conditional:** evaluates a field in its input using `equals`, `not_equals`, numeric comparisons, `contains`, `exists`, or `truthy`, and returns a boolean result.
- **HTTP Request:** calls the configured URL and stores status, response headers, and response body in the task output. Optional credentials are resolved from `FLOWFORGE_SECRET_<NAME>` environment variables.
- **Email:** validates recipients and subject and returns a safe send summary. The local process uses the log mailer; external delivery requires wiring a real `Mailer` implementation and provider configuration.

Downstream tasks receive the succeeded output of their dependency. A task with multiple dependencies receives an object keyed by dependency task ID. Root tasks receive the execution input.

## Architecture

- `cmd/flowforge` — HTTP control plane: authentication, projects, workflows, executions, schedules, webhooks, observability endpoints, and the in-process execution orchestrator.
- `cmd/worker` — independent task runner. One or more workers claim queued task runs under a bounded lease, execute them, and record attempts/results. Workers also sweep for expired leases left by dead workers.
- `cmd/migrate` — applies Goose database migrations.
- `cmd/retention` — offline retention cleanup for append-only observability tables.

The only external dependency for V1 is PostgreSQL. There is no in-memory queue; all durable state lives in Postgres. The API never executes workflow tasks directly.

## Prerequisites

- Go 1.24+
- Docker and Docker Compose (for the local Postgres and reference deployment)

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

The migration command uses goose and is safe to re-run against the same database. It resolves `DATABASE_URL` transparently, but also requires `HTTP_ADDR` and `TOKEN_SECRET` to be set because it shares the process config loader.

## Start FlowForge

In another terminal, load the same environment and start the control plane:

```sh
set -a
. ./.env
set +a
go run ./cmd/flowforge
```

The server listens on `HTTP_ADDR`, which defaults to `:8080` in `.env.example`.

## Start workers

Run one worker per terminal. Each must use a distinct `WORKER_ID`:

```sh
WORKER_ID=worker-1 go run ./cmd/worker
WORKER_ID=worker-2 go run ./cmd/worker
```

The control plane and workers are separate processes; the API never executes task code itself. A scheduled or webhook-triggered execution is orchestrated by the in-process engine, which enqueues runnable tasks for workers to claim.

## Verify health

```sh
curl -i http://localhost:8080/health
```

With PostgreSQL available, the endpoint returns HTTP `200` with a JSON body showing both service and database health. If PostgreSQL becomes unavailable, it returns HTTP `503` with a degraded status.

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

Editing the draft after publication does not change an existing version. `POST .../versions/<version_id>/activate` selects the version that receives new triggers.

## Executions

Start an execution from a published version:

```sh
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows/<workflow_id>/executions \
	-H "Authorization: Bearer <access_token>" \
	-H 'Content-Type: application/json' \
	-d '{"version_id":"<version_id>","input":{}}'
```

The API returns `202 Accepted` and persists execution/task status while the engine evaluates the DAG. Independent branches run concurrently across workers. If a worker dies mid-task, its lease expires and another live worker reclaims and re-runs the task — at-least-once semantics; after N lost workers the task fails terminally. Every attempt is recorded in `task_attempts`.

To safely retry a trigger without creating a duplicate, send an `Idempotency-Key` header:

```sh
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows/<workflow_id>/executions \
	-H "Authorization: Bearer <access_token>" \
	-H "Idempotency-Key: my-unique-run" \
	-H 'Content-Type: application/json' \
	-d '{"input":{}}'
```

## Schedules and webhooks

Create a schedule linked to a workflow and timezone:

```sh
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows/<workflow_id>/schedules \
	-H "Authorization: Bearer <access_token>" \
	-H 'Content-Type: application/json' \
	-d '{"cron_expression":"* * * * *","timezone":"UTC"}'
```

Create a signed webhook:

```sh
curl -X POST http://localhost:8080/api/v1/projects/<project_id>/workflows/<workflow_id>/webhooks \
	-H "Authorization: Bearer <access_token>" \
	-H 'Content-Type: application/json' \
	-d '{"secret":"<your-webhook-secret>"}'
```

Invoke the webhook with an HMAC-SHA256 signature over the raw body, plus an optional `X-Webhook-Timestamp` and an `X-Delivery-ID` for idempotent replay protection:

```sh
curl -X POST http://localhost:8080/api/v1/webhooks/<webhook_id> \
	-H 'Content-Type: application/json' \
	-H 'X-Webhook-Signature: <hex signature>' \
	-H 'X-Delivery-ID: delivery-1' \
	-d '{"event":"build"}'
```

## Observability

The control plane exposes project-isolated operational endpoints:

- `GET /api/v1/executions/{executionID}/events` — lifecycle event history.
- `GET /api/v1/executions/{executionID}/logs` — persisted structured logs.
- `GET /api/v1/executions/{executionID}/attempts` — append-only attempt history with worker assignment and failure classification.
- `GET /api/v1/workers` — active worker activity.
- `GET /api/v1/queue` — queue and lease health.
- `GET /api/v1/metrics` — aggregate operational summary.

Structured logs are emitted as JSON to stdout. Redaction is handled by structured field policy; credential material is never logged or returned.

## Retention

Append-only observability tables grow with use. Run the offline retention cleanup to bound them:

```sh
go run ./cmd/retention -days 30
```

The command prunes `execution_events`, `log_entries`, and `task_attempts` older than the retention window, plus orphaned `execution_idempotency` rows. It is intentionally a separate offline process so it can never affect live traffic.

## Run tests

Unit tests run without external services:

```sh
go test ./...
```

PostgreSQL integration tests run when `INTEGRATION_DATABASE_URL` is set. For the local Compose database:

```sh
INTEGRATION_DATABASE_URL="$DATABASE_URL" go test ./... -count=1
```

The integration suite verifies migrations, migration reruns, project isolation, immutable versions, the durable queue, lease expiry, heartbeat fencing, worker recovery, retries, concurrency/idempotency, schedules, webhooks, and the observability views.

## Build and release

A `Makefile` provides common operations:

```sh
make migrate        # apply database migrations
make test           # run the full unit test suite
make test-integration  # run integration tests against INTEGRATION_DATABASE_URL
make build          # build all binaries
make fmt            # gofmt -w
make vet            # go vet ./...
make check          # gofmt -l + go vet + go build
```

The repository's CI (`.github/workflows/ci.yml`) runs formatting, vet, build, unit tests, `govulncheck`, and a PostgreSQL-backed integration job.

See `docs/OPERATIONS.md` for the full deployment, migration, backup/restore, and failure runbook. See `docs/TESTING.md` for the verification strategy.
