# FlowForge — UI Routes

## 1. Route Principles

The frontend is divided into:

- public routes
- authenticated application routes

Authenticated routes require a valid user session.

The frontend must not expose routes for backend capabilities that do not currently exist.

---

# 2. Public Routes

## `/`

Landing page.

Purpose:

- explain FlowForge
- communicate the core workflow concept
- provide authentication entry points

Actions:

- Sign in
- Create account

---

## `/login`

Login page.

Capabilities:

- email/password login
- validation
- authentication error handling
- navigation to signup

---

## `/signup`

Registration page.

Capabilities:

- email
- display name
- password
- validation
- registration error handling
- navigation to login

---

# 3. Authenticated Routes

All authenticated routes are under `/app`.

---

## `/app`

Dashboard.

Displays:

- project summary
- workflow summary where available
- recent executions where available
- recent workflows
- useful next actions

Primary actions:

- create project
- open project
- create workflow
- inspect execution

---

## `/app/projects`

Project list.

Displays:

- projects belonging to the authenticated user
- project names
- relevant metadata

Actions:

- create project
- open project

---

## `/app/projects/:projectId`

Project overview.

Displays:

- project identity
- workflows
- recent executions where available
- project navigation

---

## `/app/projects/:projectId/workflows`

Workflow list.

Displays:

- workflow names
- active/published state
- version information where available

Actions:

- create workflow
- open workflow

---

## `/app/projects/:projectId/workflows/new`

Workflow creation.

Allows the user to:

- enter workflow name
- create workflow

After successful creation, navigate to the workflow builder.

---

## `/app/projects/:projectId/workflows/:workflowId`

Workflow builder.

Primary product surface.

Capabilities:

- display workflow
- add supported tasks
- configure tasks
- connect tasks
- move tasks
- remove tasks
- validate workflow
- save workflow
- publish workflow version
- activate/deactivate versions where supported
- run workflow when an executable version is available

---

## `/app/projects/:projectId/workflows/:workflowId/versions`

Workflow version history.

Displays:

- version identifiers
- version numbers where available
- publication state
- activation state
- timestamps where available

Actions:

- inspect version
- activate
- deactivate

---

## `/app/projects/:projectId/executions`

Execution history.

Displays:

- execution
- workflow
- status
- timestamps where available

Actions:

- inspect execution

---

## `/app/projects/:projectId/executions/:executionId`

Execution detail.

Displays:

- overall execution status
- workflow
- workflow version
- task-run states
- task results where available
- failure information
- attempt information where available

---

## `/app/settings`

Settings.

Settings should only contain options supported by actual backend functionality.

Do not create fake settings for unsupported features.

---

# 4. Not Top-Level Routes

Schedules and webhooks are backend capabilities, but they are managed in context inside a workflow (the Triggers dialog), not as top-level pages, so `/app/schedules` and `/app/webhooks` do not exist.

Do not add routes for capabilities the backend does not expose:

- `/app/workers` — worker, queue, and metrics data is read-only observability, not an administration UI
- `/app/team`, `/app/billing`, `/app/api-keys` — not part of the product

---

# 5. Route Protection

Unauthenticated users attempting to access protected routes should be redirected to `/login`.

Authenticated users should not be unnecessarily redirected through public authentication pages.

---

# 6. Navigation

The application shell should expose only navigation that corresponds to implemented functionality.

Navigation should not advertise unfinished product capabilities.
