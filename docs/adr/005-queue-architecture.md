# ADR 005: Durable Queue Behind a Vendor-Neutral Contract

## Context

The orchestrator must buffer work and workers must scale independently. Queue technology affects operations, but domain behavior must not be coupled to a vendor.

## Decision

Define a small queue contract for durable submit, claim/delivery, acknowledgement, delayed delivery, redelivery, and recovery. Select the simplest reliable implementation for V1 during Phase 4. Queue messages contain references and fencing metadata; PostgreSQL remains authoritative.

## Alternatives considered

- PostgreSQL-only polling: easy dependency story, but weaker delivery throughput and clearer separation.
- Redis or a broker directly in domain code: operationally viable, but creates vendor coupling.
- Multiple queues from V1: useful at scale but unnecessary before fairness and quotas are proven.

## Tradeoffs

An adapter adds a small abstraction and the selected queue must be operated locally and in CI. The contract enables replacement and focused queue failure tests.

## Consequences

Queue depth, age, redelivery, and health are observable. Final vendor selection is a Phase 4 implementation decision, not an architecture change.
