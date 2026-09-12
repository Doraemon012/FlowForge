# Observability Requirements

Observability covers control-plane services, scheduler, orchestrator, queue, workers, and task runtimes. It must explain both business workflow outcomes and distributed failure behavior without exposing secrets.

Phase 5 workers emit structured startup, claim, completion, and failure records containing worker, task-run, execution, and task identifiers. Phase 6 adds heartbeat/renewal records, lease-loss cancellation, expired-lease recovery sweeps, retry exhaustion (`worker lost after N attempts`), and stale-result-discard records, each carrying worker, task-run, execution, task, and attempt identifiers. Queue inspection exposes queued, claimed, completed, and failed state plus lease expiry, last-heartbeat timestamps, and per-attempt status (`running`, `succeeded`, `failed`, `worker_lost`) in the append-only attempt history.

## Correlation

Structured records include `request_id` and, when applicable, `project_id`, `workflow_id`, `workflow_version_id`, `execution_id`, `task_id`, `task_attempt_id`, and `worker_id`. These identifiers are stable across retries and appear in API responses and dashboard links. Credential values, raw authorization headers, and sensitive payloads are redacted.

## Logs

Emit structured JSON logs with timestamp, severity, service, event name, identifiers, duration, and a safe error classification. Important events include execution accepted, task queued/claimed/started/succeeded/failed, retry scheduled, lease renewed/expired, worker registered/heartbeat missed/offline, cancellation requested, and reconciliation. Logs are centralized with retention and access controls; user task output is not automatically logged.

## Metrics

Track API request rate/latency/errors, execution acceptance and terminal counts, task throughput and latency, retry/timeout/worker-loss counts, queue depth/age/redelivery, lease expiry, heartbeat age, active workers, worker utilization, and database/queue health. Metrics labels use bounded identifiers or categories, never raw payloads or secrets. Alert on sustained queue growth, missing workers, repeated lease expiry, and terminal failure spikes.

## Traces and events

The system may use request and execution spans where tracing infrastructure is available; the domain event history is mandatory even without distributed tracing. Events are append-only and queryable by execution. A trace should connect trigger, orchestration, queue delivery, worker attempt, and external call while recording sampling and redaction policy.

## Health and dashboard

Health endpoints distinguish process readiness from dependency health. Operators can inspect worker last heartbeat, queue depth and oldest item, active leases, retry backlog, and reconciliation lag. The dashboard shows execution/task status, attempt number, worker assignment, timestamps, safe failure reason, logs, and artifact links. Live updates may use polling or a streaming transport, but persisted API state remains authoritative.
