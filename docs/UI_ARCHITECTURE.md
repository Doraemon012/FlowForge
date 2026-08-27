# FlowForge — UI Architecture

## 1. Purpose

This document defines the architecture of the FlowForge frontend.

The frontend is a client of the existing FlowForge control-plane API. It must not duplicate backend business logic, invent unsupported API contracts, or expose internal infrastructure details that are not meaningful to normal users.

The backend remains authoritative for:

- authentication
- authorization
- projects
- workflows
- workflow versions
- execution state
- task-run state
- queue state
- worker execution
- leases
- heartbeats
- recovery
- persistence

The frontend is responsible for:

- presenting the product
- collecting user input
- workflow editing
- displaying persisted state
- communicating API failures clearly
- managing local UI state
- providing a coherent workflow from account creation to execution inspection

---

## 2. Architectural Principles

### 2.1 Backend is authoritative

The frontend must never assume that local state represents the canonical server state.

After mutations such as:

- create
- update
- publish
- activate
- deactivate
- execute

the frontend must reconcile with server state.

### 2.2 Do not invent backend capabilities

The frontend may only use APIs that exist.

If a desired UI feature requires an API that does not currently exist, the feature must be:

1. omitted from V1,
2. implemented using an existing supported contract, or
3. explicitly documented as a backend gap requiring a future change.

### 2.3 Server state and UI state are separate

Server state includes:

- User
- Project
- Workflow
- Workflow Version
- Execution
- Task Run

UI state includes:

- selected workflow node
- canvas zoom
- canvas position
- open panel
- active tab
- modal visibility
- unsaved editor changes
- local form state

Server state should be managed through a dedicated server-state/query layer.

UI/editor state should remain local unless a real cross-component requirement justifies broader state management.

### 2.4 No unnecessary global state

Do not introduce a global state library merely because one is available.

Use local component state for local concerns.

Use server-state caching for API-backed state.

Introduce global state only when a concrete cross-route or cross-component requirement exists.

---

## 3. Frontend Technology

The approved V1 stack is:

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- shadcn/ui
- Lucide
- XYFlow / React Flow
- TanStack Query
- React Hook Form
- Zod

Testing:

- Vitest
- React Testing Library
- Playwright for end-to-end flows

No additional major frontend framework should be introduced without architectural justification.

---

## 4. High-Level Architecture

```mermaid
flowchart TD
    Browser["Browser"]
    Router["React Router"]
    UI["UI Components"]
    Builder["Workflow Builder"]
    Forms["Forms / Validation"]
    Query["Server State / Query Layer"]
    API["API Client"]
    Backend["FlowForge HTTP API"]
    DB["PostgreSQL"]
    Queue["Durable Queue"]
    Workers["Worker Processes"]

    Browser --> Router
    Router --> UI
    UI --> Builder
    UI --> Forms
    UI --> Query
    Builder --> Query
    Forms --> Query
    Query --> API
    API --> Backend
    Backend --> DB
    Backend --> Queue
    Queue --> Workers
    Workers --> DB