# ADR 004: Immutable Published Workflow Versions

## Context

Editing a workflow while it is executing must not change the graph, task configuration, or policy used by that execution.

## Decision

A workflow is a logical identity with drafts and immutable published versions. Publishing creates a version snapshot. Activation selects the version for new triggers. Every execution stores one version ID and reads only that snapshot for its lifetime.

## Alternatives considered

- Mutate one workflow record in place: running executions become nondeterministic.
- Copy the entire workflow at execution time: preserves behavior but loses a clear reusable version identity and complicates audit.
- Git-only versioning: useful later, but insufficient as the runtime's authoritative reference.

## Tradeoffs

Storage grows with versions and publication requires validation. The model makes rollback, audit, concurrent executions, and reproducible debugging straightforward.

## Consequences

Published versions cannot be edited or deleted while referenced. API and data-model contracts distinguish workflow, draft, version, and execution. Workflow-as-code import/export can be added after this invariant is stable.
