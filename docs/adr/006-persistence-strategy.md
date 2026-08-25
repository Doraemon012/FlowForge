# ADR 006: PostgreSQL as Authoritative State Store

## Context

FlowForge has relational ownership, immutable versions, DAG definitions, executions, attempts, leases, schedules, and audit history. Recovery requires transactional conditional updates.

## Decision

Use PostgreSQL as the V1 source of truth. Persist current state plus append-only attempts and execution events; do not require full event sourcing. Store large artifacts externally and retain references in PostgreSQL.

## Alternatives considered

- Document database: flexible task JSON, but weaker relational invariants and authorization joins.
- Queue as state store: loses queryable history and durable control-plane ownership.
- Full event sourcing: powerful replay, but excessive complexity for the first complete product.

## Tradeoffs

Frequent execution updates require indexing, retention, and careful transactions. PostgreSQL adds a required dependency, but Docker Compose and migrations make local operation reproducible.

## Consequences

State transitions, lease fencing, idempotency uniqueness, and project isolation are database-backed. Schema migrations and backup/restore are release requirements.
