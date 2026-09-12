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

FlowForge provides email/password account creation and login, stores only a slow password hash, and issues short-lived bearer access tokens. User endpoints require that token. The token identifies a `User`; an inactive user is rejected. Every resource lookup includes the authenticated user's project ownership check. Each project has one owner. Workers use a separate service credential and worker identity, never a user token. Password reset, external identity providers, and SSO are not implemented.

## Projects

`POST /projects` creates a project owned by the caller. `GET /projects` lists owned projects. `GET /projects/{projectID}` returns metadata. `PATCH /projects/{projectID}` updates metadata. `DELETE /projects/{projectID}` archives a project and is rejected while policy-protected active work exists. All routes return `401` for missing identity, `403` for a non-owner, `404` when the resource is intentionally not disclosed, and `422` for invalid input.

## Workflows and versions

`POST /projects/{projectID}/workflows` creates a draft. `GET/PATCH /projects/{projectID}/workflows/{workflowID}` reads or edits draft metadata and definition. `POST .../validate` returns graph and task validation errors without publishing, plus the advisory review warnings described under "Workflow review warnings" below. `POST .../versions` validates and creates an immutable version. `POST .../versions/{versionID}/activate` and `/deactivate` change which version receives new triggers. `GET .../versions` lists versions.

A draft definition is `{ "tasks": [...] }`. Each task is `{ "id": string, "type": string, "config": object, "depends_on": [string] }`. The fixed built-in types are `http`, `transform`, `delay`, `conditional`, and `email`. The API stores and validates definitions but never executes tasks itself. A version must contain a valid acyclic task graph, supported task types, configuration objects, and dependency references. Empty definitions, duplicate or blank IDs, unknown dependencies, self-dependencies, cycles, and unsupported types are rejected with deterministic `422` validation errors. Published versions cannot be edited or deleted.

## Workflow review warnings

Validation answers "is this definition structurally correct?" Review answers the different question "is this definition probably what you meant?" Review returns non-blocking `warnings` for patterns that are valid but usually wrong, so a workflow (especially an AI-generated one) can be checked like a senior engineer would check it, without being blocked.

`warnings` appear on the `POST .../validate` response, on the `422` invalid-workflow response, and on both AI endpoints. Each warning is:

```json
{ "task_id": "send-email", "code": "inline_secret", "severity": "warning", "message": "..." }
```

- `task_id` — the task the warning is about, when it applies to one.
- `code` — a stable identifier for the rule.
- `severity` — `"warning"` (likely a mistake) or `"info"` (worth a second look).
- `message` — a human-readable explanation.

Rules that never block saving, publishing, or running:

- `placeholder_value` — the task configuration still contains a stand-in such as `example.com`, `changeme`, `TODO`, or an angle-bracketed value.
- `inline_secret` — an HTTP task pastes a credential into a header or body instead of referencing it with the `credential` field. FlowForge redacts credential references but cannot redact a literal the user typed.
- `unsafe_retry` — an HTTP task uses a non-idempotent method (`POST`/`PATCH`). Execution is at-least-once, so such a request may be sent more than once.
- `conditional_result_unused` — a conditional task's true/false result is not connected to any other task.
- `isolated_task` — a task in a multi-task graph is not connected to any other task.

Warnings are advisory only: ignoring them never fails a request.

## Executions and tasks

`POST /projects/{projectID}/workflows/{workflowID}/executions` creates a run from the active version, or an explicitly requested version permitted by policy. It accepts an optional JSON input payload and returns `202` immediately; an empty body uses `{}`. `GET /projects/{projectID}/executions` lists executions in an owned project. `GET /executions/{executionID}` returns persisted status and timestamps. `GET /executions/{executionID}/tasks` lists task runs. `GET /executions/{executionID}/attempts` lists the append-only attempt history. Independent workers claim queued task runs; attempts, cancellation, and worker registration are implemented.

Execution creation fails with `409` for an inactive/deleted workflow, `422` for invalid input, and `503` when the control plane cannot durably accept the request. A successful request never implies task success. Workers execute all five built-in task types (`http`, `transform`, `delay`, `conditional`, `email`); the control plane never executes task code.

## Schedules

`POST/GET/PATCH/DELETE /projects/{projectID}/workflows/{workflowID}/schedules` manages the single schedule attached to a workflow (cron expression + timezone). `GET` returns `404` until a schedule exists. A schedule creates an execution request through the same path as manual triggers, against the workflow's active version. Duplicate scheduler ticks are collapsed by a schedule occurrence key. Disabled schedules and inactive workflows do not produce new executions.

## Webhooks

`POST /projects/{projectID}/workflows/{workflowID}/webhooks` creates a webhook and returns its signing secret once; `GET` on the same path lists the workflow's webhooks, and `GET/PATCH/DELETE .../webhooks/{webhookID}` reads, enables/disables, or deletes one. Deliveries are sent to the public `POST /webhooks/{webhookID}` with an `X-Webhook-Signature` (lowercase hex HMAC-SHA256 of the raw body), an optional `X-Webhook-Timestamp` unix epoch (rejects deliveries older than five minutes), and an optional `X-Delivery-ID` idempotency key. The webhook must be enabled and the workflow must have an active version; a valid delivery creates an execution and returns `202`. Invalid authentication is `401`; repeated deliveries with the same `X-Delivery-ID` return the original acceptance. Secrets are stored as verifier material and are never exposed in workflow responses.

## AI-assisted generation and editing

`GET /ai/status` reports whether AI assistance is configured (`{"enabled": bool}`).

`POST /projects/{projectID}/workflows/{workflowID}/generate` accepts a natural-language `{ "prompt": string }` and returns a validated definition together with its review warnings (`{ "definition": { "tasks": [...] }, "warnings": [...] }`).

`POST /projects/{projectID}/workflows/{workflowID}/edit` revises an existing definition in place. It accepts `{ "instruction": string, "definition"?: { "tasks": [...] } }`; when `definition` is omitted the workflow's stored draft is edited, otherwise the supplied definition is — so the builder can refine unsaved edits. It returns a validated definition and warnings in the same shape as generation.

Both endpoints constrain the model to the supported task types and pass the result through the same definition validator before returning, with one repair retry, so a successful response is always valid. Generated definitions are also run through the review rules above, so the caller can warn that the output is valid but still needs a human look. When no provider is configured they return `503`; a definition that remains invalid returns `422` with the validator errors and code `ai_invalid_workflow`.

The provider is interchangeable and chosen entirely by configuration — application code and the UI are provider-agnostic:

- `FLOWFORGE_AI_PROVIDER` — `openai` (default) or `cohere`. An unrecognized value disables AI.
- `FLOWFORGE_OPENAI_API_KEY` / `FLOWFORGE_OPENAI_BASE_URL` / `FLOWFORGE_OPENAI_MODEL` — OpenAI (or any OpenAI-compatible chat-completions endpoint).
- `FLOWFORGE_COHERE_API_KEY` / `FLOWFORGE_COHERE_BASE_URL` / `FLOWFORGE_COHERE_MODEL` — Cohere (`/v2/chat`).

Both keys may be set at once; changing `FLOWFORGE_AI_PROVIDER` alone switches which provider is used. If the selected provider has no API key, `/ai/status` reports `{"enabled": false}` and both endpoints return `503` rather than fabricating output.

## Worker control-plane contract

Workers authenticate with a service credential and call `POST /workers/register`, `POST /workers/{workerID}/heartbeat`, `POST /workers/{workerID}/tasks/claim`, `POST /task-attempts/{attemptID}/heartbeat`, and `POST /task-attempts/{attemptID}/result`. Claim is lease-based and atomic. Heartbeats renew only the caller's valid lease. Results include attempt ID, outcome, output/artifact references, failure classification, and a fencing token or lease version so late results cannot overwrite a recovered attempt.

## Observability endpoints

`GET /executions/{executionID}/events`, `GET /executions/{executionID}/logs`, and `GET /workers` expose project-authorized operational data. Log and output responses redact secrets and may omit large values in favor of artifact references.
