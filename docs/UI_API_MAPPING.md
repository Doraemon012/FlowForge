# FlowForge — UI / API Mapping

## 1. Purpose

This document defines how the frontend consumes backend capabilities.

The actual backend implementation is the authoritative source of truth.

This document must not be treated as proof that an endpoint exists.

Before integrating an API, verify the actual backend router, handler, request model, response model, and authentication behavior.

---

# 2. Core Rule

The frontend must:

- consume existing backend APIs
- respect actual request/response contracts
- handle backend errors
- never invent unsupported endpoints
- never communicate directly with internal infrastructure
- keep API logic centralized

If this document conflicts with the backend implementation, the backend implementation takes precedence.

The documentation should then be updated to reflect the intentional contract.

---

# 3. Authentication

## 3.1 Registration

### UI

`/signup`

### Purpose

Create a new user account.

### Backend responsibility

- validate registration data
- create the account
- authenticate the user if supported by the existing contract

### Frontend responsibility

- collect required registration fields
- validate user input
- submit registration
- process authentication/session state according to the actual backend response
- display validation/authentication failures
- navigate after successful registration

### Important constraint

Do not invent:

- OAuth
- social login
- refresh tokens
- email verification
- password reset

unless those capabilities already exist in the backend.

---

# 4. Login

## 4.1 Login

### UI

`/login`

### Purpose

Authenticate an existing user.

### Frontend responsibility

- collect credentials
- validate input
- submit credentials
- establish authenticated frontend state according to backend behavior
- redirect authenticated users into the application
- handle authentication errors

### Security

Authentication details must not be logged into browser console output.

---

# 5. Logout

## UI

Authenticated application shell.

### Purpose

End the current authenticated session.

### Frontend responsibility

- invoke the supported logout behavior if one exists
- clear client authentication state
- clear protected server state where appropriate
- redirect to the public authentication experience

Do not invent a logout endpoint if the existing authentication model does not require one.

---

# 6. Projects

The frontend should integrate with the existing project APIs.

Expected capabilities include:

- create project
- list projects
- retrieve project
- update project where supported
- delete project where supported

For every operation, the frontend must use the actual backend request and response contracts.

The UI must not assume project fields that are not returned by the backend.

---

## 6.1 Project List

### UI

`/app/projects`

### Backend interaction

Retrieve projects belonging to the authenticated user.

### Frontend behavior

- request project collection
- display loading state
- display projects
- display empty state when no projects exist
- display retryable error when retrieval fails

---

## 6.2 Project Creation

### UI

Project creation form/modal.

### Backend interaction

Create a project using the actual backend contract.

### Frontend behavior

- validate required fields
- submit request
- show loading state
- handle validation/server errors
- update project list after success
- navigate where appropriate

---

## 6.3 Project Detail

### UI

`/app/projects/:projectId`

### Backend interaction

Retrieve project information using the existing project API.

### Frontend behavior

- load project
- display not-found state when appropriate
- display authorization errors appropriately
- display loading/error states

---

# 7. Workflows

The frontend should integrate with existing workflow APIs.

Expected capabilities include:

- create workflow
- retrieve workflow
- update workflow
- validate workflow

Only capabilities actually implemented by the backend may be exposed.

---

## 7.1 Workflow List

### UI

`/app/projects/:projectId/workflows`

### Backend interaction

Retrieve workflows associated with the project.

### Frontend behavior

- display workflow collection
- handle loading
- handle empty state
- handle errors
- navigate to workflow builder

---

## 7.2 Workflow Creation

### UI

`/app/projects/:projectId/workflows/new`

### Backend interaction

Create workflow using the existing contract.

### Frontend behavior

- collect workflow name/configuration supported by backend
- submit creation request
- handle validation/server errors
- navigate to the created workflow

---

## 7.3 Workflow Retrieval

### UI

`/app/projects/:projectId/workflows/:workflowId`

### Backend interaction

Retrieve workflow definition.

### Frontend behavior

- render backend workflow definition
- translate supported task definitions into editor state
- display not-found/authorization errors
- maintain unsaved local editing state separately from persisted state

---

## 7.4 Workflow Update

### UI

Workflow builder.

### Backend interaction

Persist workflow changes using the existing update contract.

### Frontend behavior

- send valid workflow representation
- show saving state
- reconcile server state after success
- preserve unsaved work after recoverable failures

---

# 8. Workflow Validation

## UI

Workflow builder → Validate.

### Backend interaction

Use the existing workflow validation capability.

### Frontend behavior

- send the current supported workflow representation
- display validation result
- associate errors with relevant tasks where possible
- prevent misleading "valid" UI when backend validation fails

The frontend may perform lightweight client-side validation for UX, but backend validation remains authoritative.

---

# 9. Workflow Versions

The frontend should integrate with the existing version APIs.

Expected capabilities include:

- publish/create version
- list versions
- retrieve version
- activate version
- deactivate version

Only actual backend-supported operations should be exposed.

---

## 9.1 Publish Version

### UI

Workflow builder → Publish.

### Backend interaction

Create/publish an immutable workflow version using the actual backend contract.

### Frontend behavior

- validate workflow before publication when appropriate
- submit publication request
- show loading state
- display resulting version
- update version state

---

## 9.2 Version List

### UI

`/app/projects/:projectId/workflows/:workflowId/versions`

### Backend interaction

Retrieve workflow versions.

### Frontend behavior

Display:

- version
- publication state
- activation state
- supported timestamps/metadata

---

## 9.3 Activate / Deactivate

### UI

Version actions.

### Backend interaction

Use actual backend activation/deactivation operations.

### Frontend behavior

- confirm consequential actions where appropriate
- display mutation state
- reconcile version state after success
- show server errors clearly

---

# 10. Executions

The backend provides asynchronous workflow execution infrastructure.

The frontend must treat execution creation as asynchronous.

---

## 10.1 Create Execution

### UI

Workflow builder → Run.

### Backend interaction

Create an execution using the existing execution API.

### Frontend behavior

1. send execution request
2. receive execution identifier/result
3. navigate to execution detail or provide equivalent monitoring entry point
4. do not wait for workflow completion during the initial request

---

## 10.2 Execution List

### UI

`/app/projects/:projectId/executions`

### Backend interaction

Retrieve executions using the actual execution API.

### Frontend behavior

Display available execution information such as:

- workflow
- status
- timestamps
- identifiers where appropriate

Do not assume pagination unless the backend supports it.

---

## 10.3 Execution Detail

### UI

`/app/projects/:projectId/executions/:executionId`

### Backend interaction

Retrieve execution state and supported task-run information.

### Frontend behavior

Display:

- workflow
- version
- overall execution status
- task states
- results where available
- failure information where available
- attempts where available

---

# 11. Task Runs

Task-run information must come from actual backend execution/task APIs.

The frontend may display:

- task status
- task result
- failure reason
- execution timing
- attempt information

only when those values are exposed by the backend.

The frontend must not reconstruct internal worker state from assumptions.

---

# 12. Execution Polling

If no real-time event API exists, the frontend may poll execution state.

Polling should:

- occur only for active executions
- use a controlled interval
- stop after terminal state
- stop when the user leaves the relevant context where appropriate
- tolerate transient API failures
- avoid unnecessary requests

The frontend must not simulate task progress.

---

# 13. Distributed Execution Information

The backend contains:

- durable task leases
- worker identity
- heartbeats
- lease recovery
- retry/attempt tracking
- stale-worker fencing

These are internal backend mechanisms.

The frontend should only expose them when corresponding information is explicitly returned by the backend.

When attempt information is available, it may be represented as:

```text
Attempt 1
Worker lost

↓

Attempt 2
Succeeded
````

The UI should translate infrastructure behavior into user-understandable execution history.

Never expose:

* lease tokens
* database locks
* raw queue records
* internal transaction details

as ordinary user-facing information.

---

# 14. Internal Queue

The frontend must never communicate directly with:

* PostgreSQL
* task queue tables
* task lease records
* queue claiming mechanisms
* recovery processes

These are backend responsibilities.

The frontend interacts only with supported HTTP/application APIs.

---

# 15. Worker System

The backend contains worker execution infrastructure.

The current frontend must not assume a worker-management API exists.

Therefore V1 must not implement:

* worker registration UI
* worker start/stop controls
* worker administration
* fabricated worker health dashboards
* direct worker communication

Worker information may only appear indirectly through supported execution/attempt data.

---

# 16. Deferred APIs

The following capabilities should not be implemented in the UI unless corresponding backend APIs are added:

* execution event stream
* SSE
* WebSockets
* execution log streaming
* worker listing
* worker management
* scheduling
* webhooks
* execution cancellation
* API key management
* team management
* billing
* provider-side idempotency controls

---

# 17. Centralized API Client

All frontend API requests should go through a centralized API/data-access layer.

The API layer is responsible for:

* backend base URL
* authentication headers/session behavior
* request serialization
* response parsing
* common error normalization
* authentication failure handling

UI components should not contain duplicated raw HTTP logic.

---

# 18. Server State

Backend-backed state should be managed through the frontend server-state architecture.

Examples:

* projects
* workflows
* versions
* executions
* task runs

After mutations, related server state must be reconciled or invalidated appropriately.

The UI must not rely on stale local copies when the backend has authoritative state.

---

# 19. Local Editing State

The workflow builder may maintain a local draft while the user edits.

The distinction must remain clear:

```text
Backend persisted state
        │
        ▼
Local editor state
        │
        ├── Save ──→ Backend
        │
        └── Discard → Backend state
```

Local editor state must not be treated as persisted backend state until the appropriate mutation succeeds.

---

# 20. Error Mapping

The frontend should distinguish at least conceptually between:

* validation errors
* authentication failures
* authorization failures
* not-found errors
* conflicts
* rate limits where applicable
* server errors
* network failures

User-facing messages should be understandable.

Technical details may be available through a secondary diagnostic view where useful.

---

# 21. Authentication Failure Handling

If an authenticated request indicates that the session is no longer valid:

1. clear invalid authentication state
2. prevent protected UI from continuing to operate as authenticated
3. redirect to authentication where appropriate

Do not repeatedly retry authentication failures.

---

# 22. API Contract Verification

Before integrating any API, inspect the actual backend implementation.

Verify:

* route
* HTTP method
* authentication requirement
* request body
* query/path parameters
* response structure
* error behavior

Do not infer contracts from names alone.

---

# 23. Backend / Frontend Responsibility Boundary

```text
┌───────────────────────────────┐
│           Frontend            │
│                               │
│ UI                            │
│ UX                            │
│ Local editing state           │
│ Server-state management       │
│ API requests                  │
└───────────────┬───────────────┘
                │
                │ HTTP / JSON
                ▼
┌───────────────────────────────┐
│            Backend            │
│                               │
│ Authentication                │
│ Authorization                 │
│ Workflow logic                │
│ Validation                    │
│ Execution orchestration       │
│ Queue                         │
│ Workers                       │
│ Leases                        │
│ Recovery                      │
│ Persistence                   │
└───────────────────────────────┘
```

The frontend must remain a consumer of backend capabilities rather than becoming a second implementation of backend business logic.

---

# 24. Contract Mismatch Rule

If the frontend documentation and backend implementation disagree:

1. inspect the actual backend behavior
2. determine whether the difference is intentional
3. update the UI documentation if necessary
4. use the actual supported contract
5. do not invent compatibility behavior without a reason

Backend changes should only be made when there is a genuine product/integration requirement.

```