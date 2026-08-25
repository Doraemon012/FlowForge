# ADR 009: Bounded Concurrent DAG Scheduling

## Context

Independent DAG branches should execute in parallel, but unlimited dispatch can exhaust workers, queues, external services, or project capacity.

## Decision

The orchestrator schedules all eligible work subject to bounded workflow, worker, and task-type concurrency. The queue provides buffering and workers pull leased tasks. V1 records enough metadata for later project quotas and priorities but does not implement complex fairness.

## Alternatives considered

- Serialize all tasks: simple but wastes independent parallelism.
- Unlimited dispatch: maximizes queueing but creates resource storms.
- Central thread pool in the API: violates the control/execution boundary.

## Tradeoffs

Concurrency limits add configuration and require backpressure metrics. They provide predictable resource use while retaining genuine multi-worker execution.

## Consequences

Tests must prove parallel branches, limit enforcement, queue growth visibility, and no duplicate scheduling. Fairness, priorities, and dedicated worker pools are V2 extensions.
