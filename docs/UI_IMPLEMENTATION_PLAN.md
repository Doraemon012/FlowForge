# FlowForge — UI Implementation Plan

## Purpose

This document defines the implementation roadmap for the FlowForge frontend.

The frontend must be implemented against the currently existing backend API.

The frontend must not invent unsupported endpoints or implement future backend capabilities prematurely.

---

# UI Phase 1 — Frontend Foundation, Authentication & Application Shell

## Objective

Create the production-quality frontend foundation and establish a complete authenticated application shell.

## Scope

### Frontend foundation

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide
- React Router
- TanStack Query
- React Hook Form
- Zod

### Application infrastructure

- centralized API client
- authentication/session handling
- protected routes
- server-state management
- application-level error handling
- reusable loading states
- reusable empty states
- reusable error states

### Authentication

- signup
- login
- logout
- authentication persistence
- unauthorized handling

### Application shell

- sidebar
- top navigation
- responsive layout
- dashboard
- project list
- project creation
- project overview

## Acceptance Criteria

A new user can:

1. open FlowForge
2. create an account
3. log in
4. enter the authenticated application
5. create a project
6. see the project in the project list
7. open the project
8. log out
9. log back in successfully

No workflow-builder functionality is required yet.

---

# UI Phase 2 — Workflow Management & Visual Workflow Builder

## Objective

Allow users to visually create, edit, validate, save, publish, and manage workflow versions.

## Scope

### Workflow management

- workflow list
- create workflow
- workflow overview
- workflow editing

### Visual builder

- workflow canvas
- task palette
- supported task nodes
- node configuration
- dependency edges
- node selection
- node movement
- node deletion
- connection management
- zoom/pan

### Persistence

- save workflow
- unsaved-change indication
- server synchronization

### Validation

- workflow validation
- validation errors
- node-associated validation feedback

### Versioning

- publish workflow version
- version history
- inspect version
- activate version
- deactivate version

## Acceptance Criteria

A user can:

1. create a workflow
2. open the workflow builder
3. add supported tasks
4. configure tasks
5. connect tasks
6. modify the workflow
7. validate the workflow
8. correct validation errors
9. save the workflow
10. publish a version
11. view version history
12. activate/deactivate supported versions

---

# UI Phase 3 — Execution, Observability UX & Production Polish

## Objective

Allow users to execute workflows and understand their execution state and outcomes.

## Scope

### Execution

- run workflow
- execution creation
- execution history
- execution detail
- execution status
- task-run status
- task results
- failure information

### Distributed execution visibility

Where supported by backend data:

- task attempts
- worker identity
- worker-loss recovery
- reassignment
- successful retry/recovery

The UI must never fabricate distributed execution information that the API does not expose.

### Execution refresh

Until a real-time event API exists:

- controlled polling
- stop polling after terminal state
- graceful handling of temporary API failures

### Production polish

- loading states
- empty states
- error states
- responsive behavior
- accessibility
- keyboard navigation
- visual consistency
- purposeful animations
- form validation
- destructive-action confirmation
- user feedback

### Testing

- component tests
- API interaction tests
- critical end-to-end flows
- production build verification

## Acceptance Criteria

A user can:

1. open a valid workflow
2. execute it
3. immediately see the created execution
4. inspect execution status
5. inspect task statuses
6. inspect results
7. inspect failures
8. understand execution recovery where supported
9. return to workflow
10. inspect previous executions

The application must be usable by a new developer without requiring knowledge of FlowForge's internal queue/lease implementation.

---

# Explicitly Deferred

The following are outside the current frontend implementation phases because corresponding backend capabilities are not currently exposed:

- scheduling UI
- webhook management
- execution event streaming
- execution log API
- worker administration
- worker management
- execution cancellation
- API key management
- team management
- billing
- enterprise SSO
- AI-generated workflows
- plugin marketplace