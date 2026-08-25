# ADR 002: At-Least-Once Task Execution

## Context

A worker can complete an external operation while its result message or database write is lost. The platform cannot always distinguish that case from work that never happened.

## Decision

FlowForge provides at-least-once task execution. Duplicate delivery and ambiguous outcomes are expected. Each attempt has durable history and a stable idempotency key. Side-effecting task types use provider idempotency where available and document unavoidable ambiguity. FlowForge does not promise exactly-once execution.

## Alternatives considered

- Exactly-once claim: misleading across external systems and network failures.
- At-most-once: avoids duplicates at the cost of silently losing accepted work.
- Full transactional event sourcing: could strengthen recovery but adds V1 complexity without solving external side-effect ambiguity.

## Tradeoffs

Tasks and integrations must be designed for duplicate execution, and users may see more than one attempt. In return, accepted work is recoverable and execution history is honest.

## Consequences

Result handling is idempotent and fenced by attempt/lease identity. Tests must cover duplicate messages and stale results. Documentation and APIs must distinguish task success from attempt history and ambiguous outcomes.
