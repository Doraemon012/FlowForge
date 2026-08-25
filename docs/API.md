# API Contracts

The API is the control-plane boundary. It authenticates requests, authorizes access to project-owned resources, validates input, persists state, and returns without executing tasks. JSON examples are illustrative; exact Go types and route versioning are implementation details.

## Conventions

- Base path: `/api/v1`.
- Resource IDs are opaque. Every response includes a request/correlation ID in headers or error bodies.
- Successful trigger creation returns `202 Accepted` with an execution ID.
- List endpoints are paginated and project-scoped.
- Clients may send `Idempotency-Key` for execution creation and webhook delivery. Repeating a key with the same request returns the original result; reusing it with different input is rejected.
- Errors use a stable code, human-readable message, and field details where relevant. Secrets and credential values are never returned.

## Authentication and authorization

V1 provides email/password account creation and login, stores only a slow password hash, and issues short-lived bearer access tokens. User endpoints require that token. The token identifies a `User`; an inactive user is rejected. Every resource lookup includes the authenticated user's project ownership check. V1 has one owner per project. Workers use a separate service credential and worker identity, never a user token. Password reset, external identity providers, and SSO are later concerns.

## Projects

`POST /projects` creates a project owned by the caller. `GET /projects` lists owned projects. `GET /projects/{projectID}` returns metadata. `PATCH /projects/{projectID}` updates metadata. `DELETE /projects/{projectID}` archives a project and is rejected while policy-protected active work exists. All routes return `401` for missing identity, `403` for a non-owner, `404` when the resource is intentionally not disclosed, and `422` for invalid input.

## Workflows and versions

`POST /projects/{projectID}/workflows` creates a draft. `GET/PATCH /projects/{projectID}/workflows/{workflowID}` reads or edits draft metadata and definition. `POST .../validate` returns graph and task validation errors without publishing. `POST .../versions` validates and creates an immutable version. `POST .../versions/{versionID}/activate` and `/deactivate` change which version receives new triggers. `GET .../versions` lists versions.

A draft definition is `{ "tasks": [...] }`. Each task is `{ "id": string, "type": string, "config": object, "depends_on": [string] }`. Phase 3 accepts only the fixed built-in types `http`, `transform`, `delay`, `conditional`, and `email`; it stores configuration but does not execute tasks. A version must contain a valid acyclic task graph, supported task types, configuration objects, and dependency references. Empty definitions, duplicate or blank IDs, unknown dependencies, self-dependencies, cycles, and unsupported types are rejected with deterministic `422` validation errors. Published versions cannot be edited or deleted.

## Executions and tasks

`POST /projects/{projectID}/workflows/{workflowID}/executions` creates a run from the active version, or an explicitly requested version permitted by policy. It accepts an input payload, trigger metadata, and an optional idempotency key. `GET /executions/{executionID}` returns persisted status and timestamps. `GET /executions/{executionID}/tasks` lists task executions; `GET /tasks/{taskExecutionID}/attempts` returns append-only attempts and worker assignments. `POST /executions/{executionID}/cancel` records a cancellation request and returns the current cancellation state.

Execution creation fails with `409` for an inactive/deleted workflow, `422` for invalid input, and `503` when the control plane cannot durably accept the request. A successful request never implies task success.

## Schedules

`POST/GET/PATCH/DELETE /projects/{projectID}/schedules` manages schedules linked to a workflow and timezone. A schedule creates an execution request through the same path as manual triggers. Duplicate scheduler ticks are collapsed by a schedule occurrence key. Disabled workflows do not produce new executions.

## Webhooks

`POST /hooks/{projectID}/{workflowID}/{hookID}` accepts only a configured active webhook. The caller supplies a signature or scoped secret according to deployment configuration, plus a timestamp/nonce where replay protection is enabled. The endpoint validates size, timestamp, signature, and payload before creating an execution and returns `202`. Invalid authentication is `401/403`; stale or repeated delivery is handled by the idempotency key and returns the original acceptance where applicable. Webhook secrets are stored as secret material or a verifier, not exposed in workflow responses.

## Worker control-plane contract

Workers authenticate with a service credential and call `POST /workers/register`, `POST /workers/{workerID}/heartbeat`, `POST /workers/{workerID}/tasks/claim`, `POST /task-attempts/{attemptID}/heartbeat`, and `POST /task-attempts/{attemptID}/result`. Claim is lease-based and atomic. Heartbeats renew only the caller's valid lease. Results include attempt ID, outcome, output/artifact references, failure classification, and a fencing token or lease version so late results cannot overwrite a recovered attempt.

## Observability endpoints

`GET /executions/{executionID}/events`, `GET /executions/{executionID}/logs`, and `GET /workers` expose project-authorized operational data. Log and output responses redact secrets and may omit large values in favor of artifact references.
