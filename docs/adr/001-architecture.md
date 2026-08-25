# ADR 001: Separate Control and Execution Planes

## Context

FlowForge must expose responsive control APIs while tasks may run for a long time or fail independently. Running task code in the API would couple user traffic to worker capacity and make failure recovery opaque.

## Decision

Separate a persistent control plane from an execution plane. The control plane owns identity, projects, workflow versions, orchestration decisions, and execution state. A durable queue transports task references to independently authenticated workers. Workers execute task runtimes and report outcomes; they do not own authoritative workflow state.

## Alternatives considered

- Execute tasks in API handlers: simple initially, but blocks requests and violates failure isolation.
- One in-process background thread: asynchronous appearance without worker coordination or durable recovery.
- Separate microservice for every domain: stronger isolation but unnecessary operational complexity for V1.

## Tradeoffs

The boundary requires explicit queue, worker, and result contracts and introduces eventual consistency in status views. It permits independent scaling and makes failure injection testable.

## Consequences

The API returns accepted execution IDs rather than results. PostgreSQL remains the source of truth, and the queue is a delivery mechanism. V1 may deploy logical components together for convenience, but task execution must remain a separate worker process.
