# ADR 008: Versioned Structured DAG Definitions

## Context

The engine needs deterministic dependency resolution and workers need task configuration independent of the UI. A visual editor is not required to prove orchestration.

## Decision

Represent a workflow version as a validated structured document containing metadata, trigger configuration, task nodes keyed within the version, dependency edges, input/output mappings, and execution policies. V1 may provide a basic editor or API; the stored representation is authoritative. Publication rejects cycles and invalid references.

## Alternatives considered

- Code-only workflows: strong developer ergonomics but harder to persist, validate, and inspect in a service.
- Visual graph as source of truth: couples runtime semantics to UI representation.
- YAML-only files: portable, but still needs a canonical validated runtime model.

## Tradeoffs

Structured JSON/configuration requires schema evolution and careful validation. It makes versions immutable, API-compatible, and executable by workers without UI dependencies.

## Consequences

Task types use a stable contract. Workflow-as-code import/export and richer visual editing can be added in V2 without changing execution identity or dependency semantics.
