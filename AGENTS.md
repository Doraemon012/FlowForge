# FlowForge — Agent Instructions

## Project

FlowForge is a distributed workflow orchestration platform.

The primary engineering goal is to demonstrate production-grade software engineering and distributed-systems concepts including:

- asynchronous task execution
- workflow orchestration
- DAG-based dependency execution
- worker coordination
- concurrency
- retries
- timeouts
- task leasing
- heartbeats
- failure recovery
- scheduling
- execution observability

This is a portfolio project, but the architecture should follow production-quality engineering principles.

---

## Source of Truth

Before making architectural or implementation decisions, read:

1. `docs/DESIGN.md`
2. `docs/API.md`
3. `docs/DATA_MODEL.md`
4. `docs/EXECUTION_ENGINE.md`
5. `docs/TESTING.md`
6. `docs/SECURITY.md`
7. `docs/OBSERVABILITY.md`
8. all ADRs under `docs/adr/`

These documents define the intended system behavior.

If implementation details are unspecified, choose a reasonable engineering solution without changing the product or architecture.

If a decision would materially change the architecture, stop and ask for clarification instead of silently changing the design.

---

## Core Architectural Rules

### 1. Separate control plane and execution plane

The API/control plane must not directly execute workflow tasks.

Workflow execution must occur asynchronously through the execution system and workers.

### 2. Workers execute tasks

Workers are responsible for performing task work.

The orchestrator is responsible for deciding what should execute.

Do not merge these responsibilities simply to simplify implementation.

### 3. Persistent execution state

Workflow execution state must be persisted.

Do not rely on in-memory state as the source of truth.

### 4. At-least-once execution

FlowForge uses at-least-once task execution semantics.

Do not claim exactly-once execution.

Tasks must be designed with duplicate execution in mind.

### 5. Task leasing

Workers must acquire temporary ownership/leases for tasks.

A worker must not own a task indefinitely.

Expired leases must allow recovery by another worker.

### 6. Heartbeats

Long-running workers/tasks must provide liveness information.

The system must be able to detect workers that disappear unexpectedly.

### 7. Failure recovery

Worker failure must not permanently lose an executing task.

The system must support recovery through lease expiration and task re-queueing/retry according to execution policy.

### 8. Immutable workflow versions

Published workflow versions must be immutable.

Executions reference a specific workflow version.

Editing a workflow must not mutate the workflow definition used by an existing execution.

### 9. Asynchronous execution

Long-running operations must not block API requests.

Use background execution for workflow tasks.

### 10. Idempotency

Operations that may be retried or delivered multiple times must be designed with idempotency considerations.

---

## Implementation Principles

Prefer:

- clear boundaries
- simple abstractions
- explicit state transitions
- testable components
- observable behavior
- typed interfaces where appropriate
- small cohesive modules
- deterministic behavior
- explicit error handling

Avoid:

- unnecessary abstractions
- premature optimization
- duplicated business logic
- hidden global state
- magic behavior
- tightly coupling the API to workers
- silently swallowing errors

---

## Distributed Systems Requirements

Do not remove or simplify these features merely because they increase implementation complexity:

- multiple workers
- queue-based task dispatch
- task leases
- heartbeats
- retries
- timeouts
- worker failure recovery
- concurrent execution
- execution history

These are core project requirements.

---

## Testing Requirements

Every major feature must have tests.

At minimum, the system must eventually test:

- workflow validation
- task dependency resolution
- state transitions
- successful execution
- task failure
- retries
- timeouts
- concurrent execution
- duplicate task delivery
- worker failure
- heartbeat expiration
- lease expiration
- task recovery
- workflow cancellation
- execution completion

Do not consider a feature complete merely because the happy path works.

---

## Security Requirements

Never:

- hard-code secrets
- commit credentials
- expose sensitive credentials in logs
- trust user input without validation
- allow unauthorized access to another user's/project's resources

Credentials and secrets must be handled through configuration/secrets mechanisms.

---

## Observability Requirements

Important distributed operations should be traceable using identifiers such as:

- workflow ID
- workflow version ID
- execution ID
- task ID
- task attempt ID
- worker ID

Errors should contain enough contextual information to diagnose failures.

---

## Documentation Requirements

When behavior changes:

1. update the relevant documentation
2. update tests
3. update ADRs if an architectural decision changed

Do not leave architectural documentation describing behavior that the implementation no longer supports.

---

## Development Workflow

Work in focused changes, one at a time. For each change:

1. understand the requirements
2. inspect the existing implementation
3. implement the smallest complete solution
4. write/update tests
5. run the relevant test suite
6. perform validation
7. review for architectural consistency
8. update documentation where required

Do not implement unrelated work in the same change.

---

## Definition of Done

A feature is complete only when:

- implementation exists
- expected behavior is tested
- failure behavior is considered
- relevant tests pass
- no known architectural rule is violated
- documentation is updated where necessary

---

## Important Constraint

Do not optimize for the smallest amount of code.

Optimize for:

1. correctness
2. reliability
3. clarity
4. observability
5. maintainability

The purpose of FlowForge is to demonstrate strong software-engineering and distributed-systems design.
