# FlowForge Implementation Plan

This is the only authoritative implementation sequence. `DESIGN.md` defines scope and architecture; specialized documents define contracts. Do not begin a later phase until the prior phase exit criteria pass.

## Phase 1: Foundation
**Objective:** establish a runnable Go service and durable PostgreSQL foundation.

**Scope:** repository/module layout, configuration and validation, local Postgres environment, migration runner, `User` persistence, HTTP server, DB-aware health endpoint, baseline logging and tests. No projects, workflows, tasks, queue, or workers.

**Dependencies:** none.

**Validation:** clean-database migration and rerun, config failure tests, user repository round trip, health `200` when DB is reachable and `503` when unavailable, full test command, documented local setup.

**Exit criteria:** application starts from documented instructions; DB connectivity and migrations are real and repeatable; tests pass; no secrets are committed.

## Phase 2: Projects, identity, and workflow management
**Objective:** create the ownership and immutable definition model.

**Scope:** user authentication, project ownership/isolation, workflow drafts, task graph schema, validation, publishing, activation/deactivation, immutable workflow versions, API contracts and authorization tests.

**Dependencies:** Phase 1.

**Validation:** cross-project denial, invalid DAG/configuration rejection, version immutability, active-version selection.

**Exit criteria:** an authenticated owner can create and publish a valid version; unauthorized resources are inaccessible; published definitions cannot be mutated.

## Phase 3: Single-process orchestration model
**Objective:** prove persisted DAG state transitions before distribution.

**Scope:** execution records, task executions, dependency eligibility, sequential and parallel scheduling decisions, result handling, terminal completion/failure, execution events, idempotency guards.

**Dependencies:** Phase 2.

**Validation:** linear and branching DAG tests, duplicate result handling, restart-safe state transitions.

**Exit criteria:** a published workflow can be triggered and its persisted execution reaches correct terminal state without task code running in the API.

## Phase 4: Durable queue and worker vertical slice
**Objective:** move task execution to an independent worker.

**Scope:** queue adapter, task message contract, worker registration/authentication, task claim/acknowledgement, built-in Transform and Delay tasks, result persistence, one complete trigger-to-completion path.

**Dependencies:** Phase 3.

**Validation:** API does not execute task code; queue redelivery and worker result tests; worker restart.

**Exit criteria:** a worker executes queued tasks and the orchestrator advances the workflow asynchronously.

## Phase 5: Multiple workers and concurrency
**Objective:** demonstrate genuine distributed execution.

**Scope:** multiple worker instances, capabilities, bounded concurrency, independent DAG branch execution, worker health, queue backpressure metrics.

**Dependencies:** Phase 4.

**Validation:** two workers process independent tasks concurrently and distribution is visible in history; limits prevent unbounded dispatch.

**Exit criteria:** concurrent execution works across multiple workers without violating task state invariants.

## Phase 6: Reliability and recovery
**Objective:** recover safely from ambiguous distributed failures.

**Scope:** bounded task leases, worker/task heartbeats, expiry detection, fencing, worker-lost attempts, retry policy/backoff, timeout handling, duplicate delivery, idempotency contract, cooperative cancellation.

**Dependencies:** Phase 5.

**Validation:** kill a worker during a lease, recover with another worker, preserve attempts, test stale results, retries, timeouts, cancellation, and restart reconciliation.

**Exit criteria:** the failure demonstration passes and at-least-once semantics are explicit in API/history.

## Phase 7: Triggers and scheduling
**Objective:** support real initiation modes.

**Scope:** manual/API trigger hardening, signed webhook endpoints with replay/idempotency protection, scheduler, timezone handling, missed-occurrence policy, duplicate schedule suppression.

**Dependencies:** Phase 6.

**Validation:** each trigger produces one execution request and never executes tasks directly; disabled workflows reject new scheduled/webhook runs.

**Exit criteria:** manual, API, webhook, and scheduled workflows run through the same execution path.

## Phase 8: V1 task set and artifacts
**Objective:** make the engine useful for the demonstrable product.

**Scope:** HTTP, Conditional, Email task types, stable built-in task contract, credential references, object-storage artifact references, safe input/output limits.

**Dependencies:** Phase 6; Phase 7 for webhook-driven demo.

**Validation:** task contract tests, credential redaction, idempotency behavior, large artifact reference flow, external failure classification.

**Exit criteria:** the V1 demo workflow can run with built-in tasks without putting task-specific logic in the orchestrator.

## Phase 9: Observability and dashboard
**Objective:** make distributed behavior inspectable.

**Scope:** structured logs, execution events, metrics, health/worker/queue views, execution/task/attempt APIs, basic dashboard and live refresh/streaming.

**Dependencies:** Phases 6-8.

**Validation:** trace an execution by identifiers; inspect retries, worker loss, logs, and final state; verify redaction and project isolation.

**Exit criteria:** a user can determine what failed, when, why, and on which worker.

## Phase 10: V1 hardening and release
**Objective:** produce a reproducible, demonstrable V1.

**Scope:** deployment configuration, controlled migrations, backups/restore exercise, rate/resource limits, dependency scanning, CI, retention, runbooks, security review, load/failure tests, and portfolio demo documentation.

**Dependencies:** Phases 1-9.

**Validation:** clean deployment, rollback/migration rehearsal, full test suite, failure-injection scenario, load and security checks.

**Exit criteria:** V1 acceptance scenario is reproducible and all protected distributed-systems requirements are demonstrated.

## Post-V1 roadmap

V2 follows only after V1 acceptance: collaborators and fixed roles, CLI/workflow-as-code, richer integrations, notifications, quotas/priorities, worker pools, and optional external identity providers. V3/future may add multi-region, enterprise SSO/SCIM, signed plugin SDK/marketplace, Kubernetes/GPU execution, billing, and large-scale tenancy. These are product extensions, not prerequisites for V1.
