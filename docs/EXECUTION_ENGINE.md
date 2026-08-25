# Execution Engine

## Responsibility

The orchestrator evaluates a published workflow version and persisted execution state, then decides which tasks are eligible. Workers execute task code. The API, scheduler, and orchestrator never execute business tasks directly.

## Dispatch loop

1. Create an execution in `pending` with an exact workflow version.
2. Validate input and atomically transition to `running`.
3. Find task definitions whose required predecessors succeeded and whose task execution has not been scheduled.
4. Persist `queued` task executions and enqueue durable messages using a dispatch key.
5. Workers atomically claim queued work and receive a bounded lease.
6. Persist heartbeats and progress while running.
7. Accept a result only when its attempt and lease token are current.
8. Persist the result, append an event, and reevaluate the graph.
9. Schedule retryable failures after backoff; block dependents on terminal failure.
10. Mark the execution completed when all required tasks succeed, or failed/cancelled when no valid continuation remains.

State transitions are conditional and idempotent. A duplicate queue message or result must not create duplicate logical task executions.

## Dependencies and concurrency

Workflow definitions are DAGs. Publication rejects cycles, missing nodes, duplicate keys, and unsupported dependency references. A node becomes eligible only when every required predecessor is `succeeded`. Independent nodes may run concurrently across workers. V1 enforces bounded workflow and worker concurrency; queue depth provides backpressure. Fairness and project quotas are later extensions, but dispatch must not create unlimited work in memory.

## Queue contract

The queue must durably accept a task reference, execution ID, attempt ID, task type, lease/dispatch metadata, and idempotency key. It must support acknowledgement, delayed delivery for retries, visibility/lease recovery, and redelivery after consumer loss. Queue messages are hints to reconcile persisted state, not the source of truth. The concrete queue technology is selected in the queue phase of `IMPLEMENTATION_PLAN.md`.

## Leases and heartbeats

Claiming a task atomically assigns `worker_id`, a random lease token, and an expiration time. The worker renews the lease at a bounded interval while it is alive. A result or heartbeat with a stale token is rejected. A recovery loop finds expired leases, records `worker_lost`, clears ownership, and either schedules a new attempt or marks the task terminal according to retry policy. Lease expiry is not proof that external work did not happen, which is why semantics remain at-least-once.

Worker heartbeats update worker liveness. Task-attempt heartbeats update both liveness and lease ownership. Missing heartbeats are detected after a configured grace period; the system must not rely on process memory or a clean shutdown.

## Retries, timeouts, and failure classes

Each task has maximum attempts, retryable failure classes, timeout, and backoff policy. Transient provider errors, rate limits, worker loss, and eligible timeouts may retry. Invalid configuration, missing credentials, malformed input, and unsupported task types are normally terminal. Backoff includes a cap and jitter. A timeout cancels the local execution where possible, records an explicit timeout, and follows policy; it does not claim success.

Every attempt remains visible. A task succeeds after any successful attempt; it fails only when no retry remains or the failure is terminal. A failed predecessor blocks downstream tasks unless a future explicit failure branch is part of the version.

## At-least-once and idempotency

FlowForge does not promise exactly-once execution. A worker may complete an external side effect and lose the result before persistence, causing recovery to run the task again. Every attempt has a stable execution/task idempotency key; side-effecting task implementations pass it to providers where supported and document behavior where not supported. Ambiguous outcomes are recorded rather than falsely reported as success.

## Cancellation and restart

Cancellation sets an execution cancellation request, stops new dispatch, and sends cooperative cancellation to active workers. A worker may report that external work cannot be interrupted. The engine records the distinction between requested, acknowledged, and completed cancellation.

After API, orchestrator, queue, or worker restart, reconciliation reads persisted state, requeues eligible tasks, and recovers expired leases. No accepted task may depend solely on an in-memory dispatcher.

## Required distributed tests

The engine must test dependency gating, parallel branches, duplicate delivery, stale result fencing, retries and backoff, timeouts, cancellation, restart reconciliation, lease expiry, heartbeat loss, and recovery by a second worker. The scenario of killing a worker during a leased task is a V1 acceptance test.
