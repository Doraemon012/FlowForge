# ADR 003: Bounded Task Leases and Heartbeats

## Context

A worker can disappear after claiming a task. Permanent ownership would leave work stuck indefinitely; immediate reassignment could create uncontrolled duplicates while a slow worker is still active.

## Decision

A worker atomically claims a task attempt with a lease token and expiration. Task heartbeats renew the lease. A recovery loop treats an expired lease as worker loss, records the attempt outcome, and permits a new attempt according to retry policy. Results and heartbeats with stale tokens are rejected.

## Alternatives considered

- Permanent claim until explicit release: cannot recover crashes.
- Queue acknowledgement only: insufficient when a worker dies after delivery.
- Distributed lock without persisted attempt state: loses history and complicates reconciliation.

## Tradeoffs

Lease duration and heartbeat intervals require tuning. Lease expiry can cause duplicate external work when a heartbeat is delayed, which is accepted under at-least-once semantics and mitigated with idempotency.

## Consequences

Worker health and task ownership are separate but related signals. Failure tests must kill workers, wait for expiry, verify fencing, and observe recovery by another worker. Lease metadata belongs in durable task-attempt state.
