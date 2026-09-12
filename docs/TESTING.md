# Testing Strategy

Testing must prove control-plane correctness and distributed execution behavior. Tests are deterministic where possible and use real dependencies for persistence and queue semantics.

## Unit tests

Cover configuration validation, authentication/authorization decisions, workflow schema and DAG validation, state-transition guards, dependency eligibility, retry classification/backoff, timeout calculation, idempotency keys, lease fencing, redaction, pagination, and task-runtime contracts.

## Integration tests

Run against PostgreSQL (which is also the queue). Verify migrations on an empty database, rerun safety, project isolation queries, immutable versions, transactional execution/task state changes, durable enqueue/acknowledgement, delayed retries, lease expiry, heartbeat renewal, stale-result rejection, and restart reconciliation.

## API tests

Test authenticated and unauthenticated requests, cross-project access, validation errors, workflow/version lifecycle, `202` asynchronous trigger behavior, idempotent repeated trigger requests, cancellation, schedule creation, webhook signature/replay/size handling, worker registration/heartbeats, and redacted outputs. Assert stable status codes and error codes rather than implementation details.

## Engine and worker tests

Use a controllable test clock and fake external services for dependency graphs, sequential and parallel execution, concurrency limits, retryable and permanent failures, timeouts, cooperative cancellation, duplicate queue delivery, duplicate results, and at-least-once side-effect behavior. Run at least two real worker processes for distribution tests.

The failure demonstration test kills a worker after it acquires a lease, waits for heartbeat/lease expiry, verifies a `worker_lost` attempt, confirms another worker acquires a new attempt, and verifies the workflow completes with both attempts preserved.

## End-to-end and operational tests

Exercise the complete path from workflow publication through manual, API, webhook, and scheduled triggers to dashboard/query history. Verify API restarts, orchestrator restarts, queue interruption, database reconnect, worker graceful shutdown, worker crash, and recovery. Run load tests for concurrent executions, queue backpressure, pagination, and bounded resource use.

## Test gates

Each subsystem has focused tests and objective exit criteria. CI runs formatting, static analysis, unit tests, integration tests with disposable dependencies, and race detection where supported. Failure-injection tests must exist for recovery behavior, and skipped tests must be explained rather than counted as passing.
