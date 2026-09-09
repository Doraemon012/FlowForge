# FlowForge — Documentation Page Implementation & Content Plan

This document is the **plan** for a new public-facing **Documentation** experience for FlowForge V1. It describes the routes, navigation, information architecture, content, components, and design decisions. It does not implement anything in application code — it is the specification that a later implementation batch will follow.

## 1. Ground Rules (source of truth)

- The **current V1 backend and frontend** are the source of truth. Read `README.md`, `docs/API.md`, `docs/DATA_MODEL.md`, `docs/EXECUTION_ENGINE.md`, `docs/frontend-v1-plan.md`, and `docs/UI_*.md` before implementing.
- **Never invent capabilities.** Every feature, task type, endpoint, status value, and workflow example must correspond to something that actually exists in V1. Anything not implemented is labeled **Deferred / Future**.
- **Do not expose sensitive internals.** The docs must not reveal:
  - raw lease tokens, database row identifiers, internal lock/transaction mechanics, or queue-table details
  - credential values, webhook secrets, or token signing material
  - undocumented API endpoints, internal URLs, or worker control-plane internals
  The docs describe *behavior* in user-facing terms, not internal machinery.
- **Two kinds of "V1" boundaries must stay clear:** (a) V1 *backend* capabilities, and (b) V1 *frontend* surfaces. The backend may expose an endpoint that the frontend does not yet render; the docs must say so honestly.

### Version-labeling convention

All content will carry an explicit label so readers never mistake a promise for a shipped feature:

| Label | Meaning |
| --- | --- |
| `V1` | Implemented and available today (backend and/or frontend as noted). |
| `Deferred` | Intentionally out of scope for V1; described at a high level only (V2/V3). |
| `Frontend gap` | Backend supports it, but the V1 UI does not surface it yet. |

The UI component will render these as `DocsVersionBadge` pills (see §6.2).

---

## 2. Route & Navigation Plan

### 2.1 Routes

Documentation is **public** (no authentication required), so it lives in the public route group in `App.tsx`, not under `/app`.

| Route | Purpose | Content |
| --- | --- | --- |
| `/docs` | Documentation home / redirect | Landing hero for the docs + a "start here" quickstart card grid. Redirects to `/docs/introduction` or renders it as index. |
| `/docs/:slug` | Individual section page | One top-level section (e.g. `introduction`, `concepts`, `architecture`, `stack`, `features`, `how-workflows-work`, `creating-a-project`, `creating-a-workflow`, `adding-tasks`, `dag`, `validation`, `versions`, `running`, `executions`, `recovery`, `observability`, `task-types`, `examples`, `tutorials`, `troubleshooting`, `glossary`, `interview`). |
| `/docs/:slug#anchor` | In-page sub-section anchor | Deep-link to a specific subsection (scroll-spy TOC). |

> Simplest, coherent approach: a **single long-scroll doc shell** (`/docs/:slug`) where the left sidebar is a grouped TOC and the right side (desktop) shows an "On this page" scroll-spy. `/docs` is the index/introduction. This matches modern developer-product docs (Vercel / Stripe / Temporal) and avoids an over-nested route tree.

Supporting public routes (unchanged from current V1): `/`, `/login`, `/signup`.

### 2.2 Public landing nav (update `landing.tsx`)

- Change the landing header "Docs" nav item from an in-page anchor (`href="#docs"`) to a real route link: `<Link to="/docs">Documentation</Link>`.
  - The existing landing `#docs` **code section** (the "Feels like writing regular functions" block) stays on the landing page; it is not removed. The nav no longer needs to anchor to it, but we keep a `#docs`-style code section for marketing. (Log an informational note: the nav label semantics change from an anchor to a route.)
- Add a **"Documentation"** link to the landing **footer** `Developers` column (currently a non-navigating `<li>`), pointing to `/docs`.
- Keep the landing hero's "read the docs →" text linking to `/docs`.

### 2.3 Authenticated app nav (update `Sidebar.tsx` / `TopBar.tsx`)

- Add a **"Resources"** group to the sidebar with one item: **Documentation** → `/docs`.
  - Use an existing Lucide icon (e.g. `BookOpen` or `FileText`).
  - Keep it visually consistent with `sb-item` (same class, icon + label).
- Optionally add a lightweight "help / docs" icon button in the `TopBar` (next to the command-palette search) linking to `/docs`. Keep this minimal — do not clutter the top bar.

### 2.4 Route protection

`/docs` and `/docs/:slug` are public. They must remain reachable **without** a session, so unauthenticated users / interviewers can read them. Do not wrap them in `RequireAuth`.

### 2.5 In-document navigation

- Left sidebar TOC (desktop, sticky).
- Right "On this page" scroll-spy (desktop, for long sections).
- Mobile: sidebar becomes a collapsible drawer; an in-page horizontal "chips" strip allows jumping between top-level sections.

---

## 3. Page Layout

### 3.1 Overall shell (desktop)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ DocsTopNav (logo · breadcrumb "Docs" · search · GitHub/status links)  │
├──────────────┬───────────────────────────────────────────┬───────────┤
│ DocsSidebar  │  DocsContent (max-width ~760px)            │ OnThisPage │
│  grouped TOC │   h1 → lead paragraph → sections → subs    │  (scroll- │
│  sticky      │   → callouts → code → diagrams → cards     │   spy)     │
│              │                                            │           │
│              │   Prev / Next page footer                  │           │
├──────────────┴───────────────────────────────────────────┴───────────┤
│ DocsFooter                                                             │
└──────────────────────────────────────────────────────────────────────┘
```

- `DocsSidebar`: fixed/sticky width ~260px; grouped nav (Getting Started / Concepts / Guides / Operations / Reference); active item highlighted with the existing `sb-item.active` treatment; collapsible groups.
- `DocsContent`: single centered column, generous vertical rhythm; readable text (14–16px, `--font-sans`); clear heading hierarchy (`h1` ~32px, `h2` ~24px, `h3` ~18px) using `--font-display`.
- `OnThisPage`: optional right rail (~200px) for long pages; hides on narrower widths.

### 3.2 Mobile

- Sidebar collapses to a hamburger drawer (reuse the existing mobile drawer pattern from `AppShell`).
- A top "chips" horizontal scroll strip lists the top-level sections for quick jump.
- Code blocks scroll horizontally; tables reformat to stacked card rows on small screens.
- Single-column content; no right rail.

---

## 4. Information Architecture (mapping the 22 required items)

The 22 required content items map to this grouped IA. Each group is a `/docs/:slug` page (or a section of a longer page as noted).

### Getting Started (guides, follow-along)
1. **What FlowForge is** → `/docs/introduction`
2. **How to create a project** → `/docs/creating-a-project`
3. **How to create a workflow** → `/docs/creating-a-workflow`
4. **How to add/configure tasks** → `/docs/adding-tasks`
5. **How to connect tasks into a DAG** → `/docs/dag`
6. **Validation** → `/docs/validation`
7. **Save/publish/activate versions** → `/docs/versions`
8. **Running a workflow** → `/docs/running`

### Concepts (understanding)
9. **Core concepts and terminology** → `/docs/concepts`
10. **Architecture at a high level** → `/docs/architecture`
11. **Technology/engineering stack and why** → `/docs/stack`
12. **Core capabilities/features implemented in V1** → `/docs/features`
13. **How workflows work** → `/docs/how-workflows-work`

### Guides & References
14. **Understanding executions, task runs, results and failures** → `/docs/executions`
15. **Retries, workers, queues and recovery** → `/docs/recovery`
16. **Observability** → `/docs/observability`
17. **Supported task types and what each does** → `/docs/task-types`
18. **At least two realistic complete workflow examples** → `/docs/examples`
19. **Step-by-step examples users can actually follow** → `/docs/tutorials`
20. **Common mistakes/troubleshooting** → `/docs/troubleshooting`
21. **Glossary** → `/docs/glossary`
22. **Concise "How FlowForge works" (interview)** → `/docs/interview`

> `/docs/examples` and `/docs/tutorials` share the same two walkthrough workflows (see §7) but present them differently: examples focus on the *why/what*, tutorials on the *click-by-click how*.

---

## 5. Reusable Documentation Components

Design these as dedicated doc components under `frontend/src/components/docs/` (new, coherent with shadcn + custom CSS). Each is a single-responsibility component.

| Component | Purpose |
| --- | --- |
| `DocsLayout` | Page shell: top nav, sidebar, content column, optional "on this page" rail. |
| `DocsTopNav` | Public top bar (logo, breadcrumb, search, links). |
| `DocsSidebar` | Grouped, collapsible TOC; active-state via scroll-spy/route. |
| `DocsToc` / `OnThisPage` | Scroll-spy "on this page" links for long sections. |
| `DocsSection` | Section wrapper (`<section>` with heading + optional eyebrow). |
| `DocsCallout` | Info / success / warning / **Deferred** callout. Props: `variant`, `title`. |
| `DocsVersionBadge` | `V1` / `Deferred` / `Frontend gap` pill. |
| `DocsCodeBlock` | Mono code block with copy button, syntax-highlighted (reuse `.code-block` visual). |
| `DocsDiagram` | Inline SVG diagram (dark-theme, accent line color) or a Mermaid renderer. |
| `DocsSteps` | Numbered step list with connectors (reuse landing `.step` treatment). |
| `DocsTable` | Comparison/status tables; responsive → cards on mobile. |
| `DocsCardGrid` | Link-card grid for quickstart / feature overview (reuse `.bento-card`-like styling). |
| `DocsTabs` | Tabbed code/config examples (YAML vs TS vs REST). |
| `DocsPager` | Prev / Next navigation at the bottom of each page. |
| `DocsSearch` | Client-side fuzzy filter over section titles (mobile-first) or an expanded command-palette-style search. |

All components must reuse the existing design tokens and primitives, not reinvent styling.

---

## 6. Visual Design, Hierarchy & Consistency

### 6.1 Design system consistency

The docs must be indistinguishable in look and feel from the V1 landing page and authenticated app:

- **Colors:** use the existing CSS variables — `--bg` (#0A0B0D), `--surface` (#111316), `--surface-2` (#16191D), `--border` (#1F2328), `--text` (#E6E8EB), `--muted` (#8A9099), `--accent` (**teal #5EEAD4**), `--success` (#34D399), `--failed` (#F87171), `--running` (#60A5FA), `--paused` (#FBBF24). No purple/blue gradients (hard rule).
- **Typography:** `--font-sans` (Inter) for body; `--font-display` (Inter Tight) for headings; `--font-mono` (JetBrains Mono) for identifiers, code, and technical values. `code`/`.mono` classes already apply mono.
- **Surfaces:** use `--surface` with `1px solid var(--border)`, `border-radius: 8–12px`, and the existing `--shadow-surface` scale. Avoid heavy glassmorphism/glow.
- **Motion:** reuse the existing restrained keyframes (`floatIn`, `nodePulse`, `live-dot`/`ping`). Respect `prefers-reduced-motion` (already global in `index.css`).
- **Primitives:** use shadcn/ui `Button`, `Badge`, `Card`, `Separator`, `Tooltip`, `Tabs` (if added); use custom drawing (`.code-block`, `.bento-card`, `.badge`, `.live-dot`, `.logo`, `.step`, `.why-card`) for bespoke doc surfaces. **Do not mix** shadcn `Card` and custom `.proj-card`-style rows in the same list surface.

### 6.2 Visual hierarchy

1. **Hero / lead** for `/docs` and each section: eyebrow (`lsection-eyebrow` style, teal, uppercase), `h1` (display, ~32–40px), one-sentence lead paragraph (`--muted`).
2. **Section blocks** (`h2`) with a `DocsCallout` or `DocsVersionBadge` immediately after to indicate V1 vs Deferred.
3. **Subsections** (`h3`) with small `h4` for code/config labels.
4. **Code and diagrams** placed inline after the paragraph that references them, never after a page ends.
5. **Callouts** break up walls of text; place them adjacent to the rule they qualify (e.g. "Publish ≠ Activate", "At-least-once", "Do not expose lease tokens").
6. **Prev/Next pager** at the footer of every page for guided flow.

### 6.3 Image / diagram treatment

- **Primary:** inline **SVG diagrams** rendered as React components (`DocsDiagram`), using the existing `FlowGraph` / `.fillvis` aesthetic: dotted grid background, teal `--accent` or `--running` strokes, dark node surfaces with subtle borders. Diagrams must be legible at 2× (HiDPI) and scale down on mobile.
- **Secondary:** optional **Mermaid** diagrams (entity/ER and flowchart), rendered client-side via a lightweight renderer or pre-rendered to SVG. If a Mermaid dependency is not present in V1, do **not** add one in the first pass — use hand-authored SVG instead.
- **Illustrations:** use the existing pseudo-illustration pattern from the landing page (the 3-step `.step-visual` terminal cards, the `.bento` mini-visuals like the durable-bar, version badges, and the small DAG SVG). Do not introduce external stock imagery.
- **Screenshots:** where a real UI screenshot is useful (e.g. builder, execution detail), use annotated in-theme mockups built with the same CSS; avoid heavy raster screenshots that drift from the design system. No fake telemetry/statistic graphics.

### 6.4 Callouts (labeling)

- **`V1`** callout — "This is available in V1."
- **`Deferred`** callout — "This is planned but not in V1." Used for: SSO, RBAC/collaboration, billing, worker/schedule/webhook management UI, real-time streaming, AI workflows, plugin marketplace, multi-region, exactly-once.
- **`Frontend gap`** callout — "The backend exposes this, but the V1 UI does not surface it yet." Used for: worker/queue/metrics UI, event/log streaming UI, scheduled/webhook management UI.
- **`Security`** callout — "Never expose lease tokens, credentials, or internal URLs." Used in the recovery/observability sections.

---

## 7. Realistic Workflow Examples (must be runnable in V1)

> **Constraint:** V1 sample workflows use only genuinely runnable built-in task types — `delay`, `transform`, `conditional` — so "Run" works end-to-end without external credentials/endpoints. `http` and `email` are real V1 task types but require configured credentials/endpoints; they are shown in an **advanced callout**, not in the follow-along tutorial.

### Example A — "Order notification pipeline" (tasks: transform → conditional → delay)

```text
[ Ingest ]          [ Route ]           [ Notify ]
  transform   →      conditional    →     delay
```

- **Task 1 `normalize`** (`transform`): receives an input payload, produces a normalized object (e.g. order summary).
- **Task 2 `route`** (`conditional`): depends on `normalize`; branches on a field (e.g. order amount). Produces a branch decision.
- **Task 3 `notify`** (`delay`): depends on `route`; waits a short duration (e.g. `seconds: 30`) to simulate a notification gate.

This is the primary "complete example" — follows the V1 UI flow (create project → create workflow → add 3 tasks → connect → validate → save → publish → activate → run → inspect execution + attempts).

### Example B — "Support triage" (tasks: transform → conditional → delay)

```text
[ Classify ]        [ Escalate ]        [ Hold ]
  transform   →      conditional    →     delay
```

- **Task 1 `classify`** (`transform`): reads the incoming ticket input and tags a severity.
- **Task 2 `escalate`** (`conditional`): depends on `classify`; decides if the ticket needs escalation.
- **Task 3 `hold`** (`delay`): depends on `escalate`; waits before the next action.

Both examples are **realistic, complete, and runnable** with only built-in types.

### Advanced callout (not a follow-along example)

An "advanced" variation shows `http` (fetch a payload) and `email` (send a notification). **Label it `Deferred for the simple demo`** — it requires a configured credential/endpoint; it is a real V1 task type but not runnable with zero setup. This keeps the docs honest.

---

## 8. Detailed Content Plan (per section)

Each of the following is a page plan. For every section, note the **V1 vs Deferred** labels and what content is delivered.

### 8.1 `introduction` — What FlowForge is (`/docs/introduction`)

- **Hero:** "Durable distributed workflow orchestration." One paragraph: define a DAG of tasks once; FlowForge runs it asynchronously, recovers from worker failures automatically, and records every attempt.
- **What it is / what it is not** (comparison table via `DocsTable`): FlowForge vs "cron + queues + custom retry logic".
- **Key differentiator callout (`V1`):** reliable distributed execution + durable state + at-least-once semantics + immutable versions + observability.
- **Quickstart card grid** (`DocsCardGrid`): "Create a project", "Create a workflow", "Add tasks", "Build a DAG", "Publish", "Run", each linking to its guide.
- **Non-goals callout (`Deferred`):** SSO, RBAC, billing, marketplace, multi-region, exactly-once, AI-generated workflows, rich integration catalog.

### 8.2 `concepts` — Core concepts and terminology (`/docs/concepts`)

- A short conceptual model diagram (`DocsDiagram`): `Project → Workflow → Version → Execution`.
- Defined terms (each a definition card or table):
  - **Project** — the isolation boundary / ownership unit.
  - **Workflow** — a named, versioned collection of tasks.
  - **Task** — a single unit of work with a type + config + dependencies.
  - **DAG** — directed acyclic graph of tasks; dependencies flow one way, no cycles.
  - **Workflow Version** — immutable published snapshot.
  - **Execution** — one run of a specific version.
  - **Task Run** — one task within an execution.
  - **Attempt** — one try of a task run (append-only history).
  - **Worker** — a process that leases and executes tasks.
  - **Queue** — durable delivery between orchestrator and workers.
  - **Lease** — bounded ownership of a task by a worker (explain at user level; **never** a raw token).
  - **Heartbeat** — liveness signal from a worker.
  - **Idempotency** — safe duplicate-trigger protection.
  - **At-least-once** — a task may run more than once when completion is ambiguous.
- Callout (`V1`): all terms in this section are real implemented concepts.

### 8.3 `architecture` — Architecture at a high level (`/docs/architecture`)

- **Diagram (flowchart):** `Developer → Dashboard/UI → Control-plane API → Orchestrator → Queue → Workers → Task runtime → External systems`, with PostgreSQL as the source of truth.
- **Two planes:** control plane (decides + persists state: API, orchestrator, scheduler) vs execution plane (does the work: workers, queue).
- **Key rule (`V1`):** The API never executes task code directly. Tasks are claimed and run by independent workers.
- **Durability:** PostgreSQL is authoritative; in-memory state is only cache/coordination.
- Callout (`Security`): describes concepts only — no internal URLs, no queue-table names, no lease tokens.

### 8.4 `stack` — Technology/engineering stack and why (`/docs/stack`)

Use `DocsTable` + short "why" paragraphs.

| Layer | Technology | Why (V1) |
| --- | --- | --- |
| Control plane | Go | Concurrency, single binary, strong standard library, good for durable services. |
| Durable state | PostgreSQL | Atomicity, transactional state transitions, source of truth, no extra infra. |
| Queue | PostgreSQL-backed queue | Durable, atomic claim (`FOR UPDATE SKIP LOCKED`), delayed retries, recovery; no separate broker for V1. |
| Workers | Independent Go processes | Separate scale/health; lease + heartbeat + recovery. |
| Frontend | React + TypeScript + Vite | Developer-tool UX, typed contracts, fast builds. |
| UI primitives | Tailwind + shadcn/ui + Lucide | Cohesive, accessible primitives. |
| Workflow canvas | React Flow (XYFlow) | Professional DAG editing (pan/zoom/minimap/edges). |
| Server state | TanStack Query | Reconcile with authoritative backend after mutations. |
| Forms/validation | React Hook Form + Zod | Predictable forms, typed validation. |

- Callout (`Deferred`): Kubernetes-native execution, multi-region, marketplace — future; not prerequisites for correctness.

### 8.5 `features` — Core capabilities implemented in V1 (`/docs/features`)

A `DocsCardGrid` + `DocsTable` listing each implemented capability with a **V1** badge and a one-line "what it does":

- **Authentication & ownership** — email/password, bcrypt hashes, bearer tokens, single-owner projects.
- **Workflow drafts & versions** — validate, publish immutable versions, activate/deactivate.
- **Execution engine** — persisted state, dependency gating, parallel branches, idempotency.
- **Durable queue & workers** — atomic claiming, independent workers, concurrent execution.
- **Reliability & recovery** — leases, heartbeats, fencing, retries with exponential backoff, timeouts, cancellation, worker-loss recovery.
- **Triggers** — manual/API, signed webhooks, scheduler with timezone + missed-occurrence + duplicate suppression.
- **V1 task set** — `http`, `transform`, `delay`, `conditional`, `email` behind a stable task contract (credential refs + redaction, artifact refs, safe I/O limits).
- **Observability** — lifecycle events, persisted logs, attempt history, worker/queue/metrics views.
- **Retention** — offline cleanup of append-only tables.

Deferred features callout: team collaboration/roles, CLI/workflow-as-code, richer integrations, notifications, quotas/priorities, worker pools, external identity, multi-region, marketplace.

### 8.6 `how-workflows-work` — How workflows work (`/docs/how-workflows-work`)

- Mental model: `Task A → Task B → Task C`, not `Queue → Worker → Lease → Attempt → DB`.
- A workflow is a **draft** until you **publish** an immutable **version**, then **activate** that version to receive new runs.
- **Dependencies form a DAG:** a task runs only when all required predecessors succeed. Independent tasks can run concurrently.
- Diagram: a simple 3-node DAG with a branch.
- Callout (`V1`): publish ≠ activate; Run requires an active version.

### 8.7 `creating-a-project` — How to create a project (`/docs/creating-a-project`)

- **UI path:** sign up / log in → Dashboard → "Create Project" → enter name → create.
- **API:** `POST /api/v1/projects` with `{ "name": "My Project" }`, bearer auth → project object.
- Fields: `name` (required). Owner is the authenticated user.
- Empty state, loading, error-state behavior (matches existing Projects page).
- Callout (`V1`): single-owner model; collaboration is deferred.

### 8.8 `creating-a-workflow` — How to create a workflow (`/docs/creating-a-workflow`)

- **UI path:** open a project → "Create Workflow" → enter name → enter builder.
- **API:** `POST /api/v1/projects/{project_id}/workflows` with `{ "name", "description", "definition": { "tasks": [...] } }`.
- A new workflow starts as a **draft**.
- Callout: define tasks later; the builder is the primary surface.

### 8.9 `adding-tasks` — How to add/configure tasks (`/docs/adding-tasks`)

- **In the builder:** use the **task palette** (left) to add a task, or click to create; configure via the **config panel** (right).
- Task shape: `{ "id", "type", "config" (JSON object), "depends_on" [] }`.
- Supported V1 types: `http`, `transform`, `delay`, `conditional`, `email`. (See `task-types`.)
- Config fields are type-specific; the config panel adapts to the selected type.
- Callout (`V1` for types; `Frontend gap`/`Deferred` note for `http`/`email` requiring credentials/endpoints outside the simple demo).

### 8.10 `dag` — How to connect tasks into a DAG (`/docs/dag`)

- Draw directed edges from a task to its dependents (or set `depends_on`).
- Rules: no cycles, no unknown/self dependencies, no duplicate IDs; all dependencies must resolve to tasks in the same definition.
- Independent tasks may run concurrently across workers.
- Diagram: linear + branched DAG.
- Callout: client-side cycle detection + duplicate-edge guards exist; **server validation is authoritative**.

### 8.11 `validation` — Validation (`/docs/validation`)

- **UI:** "Validate" in the builder toolbar → server `POST .../validate` returns `{ valid, errors }`; errors associate to the relevant task.
- **Client-side** pre-checks: cycle detection, duplicate edges, missing/blank IDs, unknown deps.
- **Server rules:** valid acyclic graph, supported types, config objects, valid dependency refs; rejects empty defs, duplicate/blank IDs, unknown deps, self-deps, cycles, unsupported types → `422` with field errors.
- Show a sample validation-error callout (actionable language, not raw `HTTP 500`).

### 8.12 `versions` — Save / publish / activate (`/docs/versions`)

- **Save** persists the **draft**.
- **Publish** validates and creates an **immutable numbered version**. It does **not** auto-activate. The workflow stays `draft` until activated.
- **Activate** sets the version that receives new triggers; workflow status becomes `active`.
- **Deactivate** clears the active version; workflow becomes `paused`.
- Diagram: `Draft → Published Version → Active Version`.
- Callout (`V1`) — heavily emphasize: **publish ≠ activate**. The V1 UI guides to the Versions page after publish via a toast CTA.

### 8.13 `running` — Running a workflow (`/docs/running`)

- **Run** is available only when a version is **active** (V1 behavior).
- `POST /api/v1/projects/{pid}/workflows/{wid}/executions` with optional `{ "version_id", "input" }` → **202 Accepted** + execution ID. The frontend does not wait for completion.
- **Idempotency-Key** header prevents duplicate triggers when reused with same input.
- The V1 UI navigates to execution detail to monitor (controlled 2s polling; stops on terminal).
- Callout: "A successful request never implies task success."

### 8.14 `executions` — Executions, task runs, results and failures (`/docs/executions`)

- **Execution statuses (V1):** `pending`, `running`, `completed`, `failed`, `cancel_requested`, `cancelled`, `timed_out`.
- **Task-run statuses (V1):** `pending`, `queued`, `running`, `succeeded`, `failed`, `blocked` (plus `retry_scheduled`, `cancel_requested`, `cancelled`, `timed_out`).
- **Execution detail** shows: header (workflow, pinned version, status, timestamps), task-run list with outputs/failure reason, and attempt history.
- **Failure view:** failed task, failure reason, attempt info, path back to workflow; technical details progressively disclosed.
- Callout (`V1`): status is never communicated by color alone — text + icon + badge.
- Callout (`Frontend gap` if relevant): worker/queue/metrics UI is not yet in the app.

### 8.15 `recovery` — Retries, workers, queues and recovery (`/docs/recovery`)

Presented **without** internal internals. Use an attempt timeline diagram.

- **Workers** claim queued tasks under a **bounded lease** and **heartbeat** while alive; a result/heartbeat with a stale token is rejected (fencing).
- If a worker stops heartbeating, its **lease expires**; another live worker reclaims the task → **at-least-once** execution.
- **Retries** follow an exponential backoff + jitter policy; transient errors may retry, terminal errors do not.
- **Timeouts** produce an explicit outcome and follow policy; they do not silently succeed.
- **Attempt timeline** (human-readable): `Attempt 1 · Worker A · Worker lost` → `Attempt 2 · Worker B · Succeeded`.
- Callout (`Security`): never expose lease tokens, DB locks, raw queue records, internal transaction details.
- Callout (honesty): FlowForge does **not** guarantee exactly-once; side-effecting tasks use deterministic idempotency keys where the external system supports it.

### 8.16 `observability` — Observability (`/docs/observability`)

- Backend V1 exposes project-isolated endpoints: execution events, persisted logs, attempt history, worker activity, queue/lease health, metrics.
- V1 frontend surfaces **attempt history** on execution detail and the execution list/detail with polling. Logs/events are backend capabilities; the V1 app renders attempt history and execution views.
- **Redaction:** credential material is never logged or returned; outputs may be replaced by artifact references for large values.
- Callout (`Deferred` / `Frontend gap`): worker/queue/metrics UI; real-time log/event streaming — not surfaced in the V1 app.

### 8.17 `task-types` — Supported task types and what each does (`/docs/task-types`)

| Type | What it does | V1 config note |
| --- | --- | --- |
| `http` | Performs an HTTP request. | Requires a configured endpoint/credential. |
| `transform` | Applies a transformation to input. | Runs end-to-end in samples. |
| `delay` | Waits a configured duration. | Runs end-to-end in samples. |
| `conditional` | Evaluates a condition and branches. | Runs end-to-end in samples. |
| `email` | Sends an email notification. | Requires a credential/provider. |

- Callout (`V1`): all five are V1 task types behind a stable contract. The simple sample workflows use `delay`/`transform`/`conditional` so they run with zero external setup.

### 8.18 `examples` — Realistic complete workflow examples (`/docs/examples`)

- **Example A:** Order notification pipeline (transform → conditional → delay). Full DAG diagram + step table + code/config snippet.
- **Example B:** Support triage (transform → conditional → delay). Full DAG diagram + step table + code/config snippet.
- Advanced callout: `http`/`email` variation — labeled `Deferred for simple demo` (needs credentials/endpoints).
- Each example lists the exact V1 UI actions required to reproduce it.

### 8.19 `tutorials` — Step-by-step examples users can follow (`/docs/tutorials`)

Use `DocsSteps`. Walk through Example A end-to-end:

1. Sign up / log in.
2. Create a project.
3. Create a workflow (name it).
4. Add `transform` task (`normalize`).
5. Add `conditional` task (`route`), set `depends_on: ["normalize"]`.
6. Add `delay` task (`notify`), set `depends_on: ["route"]`.
7. Validate.
8. Save.
9. Publish (creates a version).
10. Activate the version.
11. Run.
12. Open execution detail and inspect task runs + attempt history.

Callout: mention the common "Run is disabled" cause (no active version) and the route to fix it.

### 8.20 `troubleshooting` — Common mistakes / troubleshooting (`/docs/troubleshooting`)

Accordion/`DocsCallout` items:

- **Run button disabled** → no active version; publish then activate on the Versions page.
- **"Unknown dependency" / "Cycle detected"** → check `depends_on` and remove cycles/duplicate edges.
- **Duplicate task ID** → use unique task IDs.
- **Validation fails with `422`** → inspect per-task errors.
- **Execution stays running but nothing progresses** → no live worker is processing the queue; check for a running worker.
- **Attempt history shows "not available" (HTTP 501)** → observability not configured in this deployment; this is expected, not an error.
- **`http`/`email` task never succeeds** → requires a configured credential/endpoint; the simple samples intentionally avoid these.
- Callout (`Security`): don't paste credentials or internal URLs into workflow config examples.

### 8.21 `glossary` — Glossary (`/docs/glossary`)

Alphabetical term → concise definition table. Reuse every term from `concepts` and add: `version`, `active version`, `draft`, `heartbeat`, `lease`, `fencing`, `worker-lost`, `retry policy`, `backoff`, `idempotency key`, `artifact reference`, `credential reference`, `redaction`, `DAG`. Each labeled `V1`.

### 8.22 `interview` — "How FlowForge works" (`/docs/interview`)

A concise, one-screen narrative suitable for explaining the project in an interview. Structure as 4 short paragraphs + a compact diagram:

1. **What it is:** a durable distributed workflow orchestration platform; you define a versioned DAG of tasks and trigger runs.
2. **Two planes:** control plane decides and persists authoritative state; execution plane (workers + queue) actually runs tasks. The API never executes tasks.
3. **Reliability model:** workers claim tasks under bounded leases and heartbeat; on worker death the lease expires and another worker reclaims → **at-least-once**. Results are fenced against stale workers; retries use exponential backoff + jitter; timeouts are explicit.
4. **Why it matters:** every attempt is recorded, state survives restarts, versions are immutable, and observability makes failures explainable. Not exactly-once — side-effecting tasks use deterministic idempotency keys where supported.

Callout: emphasize the honest limitation (at-least-once), the architectural split, and the "postgres-backed queue with atomic claim" choice.

---

## 9. Search & In-Page Navigation

- **In-page "On this page" TOC:** right rail (desktop) with scroll-spy; highlights the current `h2`/`h3`.
- **Docs search (client-side):** a filter input at the top of the sidebar (mobile) and/or a `⌘K` command-palette-style search listing matching section titles + descriptions, reusing the existing `CommandPalette` pattern with `commandPaletteStore`-like state. **Filtering/search is local only** — no backend search API.
- **Jump chips (mobile):** horizontal scrollable strip of top-level sections.
- **Keyboard navigation:** `⌘K` to open search; ArrowUp/Down to navigate results; Enter to select; Escape to close; visible focus.

---

## 10. Responsive / Mobile Behavior

- **Desktop (>960px):** sidebar + content + optional right rail (sticky). Content max-width ~760px.
- **Tablet (≤960px):** hide right rail; keep left sidebar (collapsible).
- **Mobile (≤640px):** sidebar becomes a drawer (reuse `AppShell` mobile drawer pattern); horizontal chips for section jumps; single-column content; code blocks scroll horizontally; tables reflow to stacked cards; touch targets ≥44px.
- `prefers-reduced-motion`: reuse the global rule; no decorative scroll animations.

---

## 11. Accessibility Requirements

- **Landmarks:** `<nav>` for sidebar and "on this page"; `<main>` for content; skip-to-content link at the top.
- **Headings:** semantic `h1` (page) → `h2` (section) → `h3` (subsection); no skipped levels.
- **Active TOC item:** `aria-current="page"` or `aria-current="location"`; visible focus ring.
- **Code blocks:** `role="region"` + `aria-label`; copy button has `aria-label`.
- **Callouts:** labeled by role via `DocsCallout` heading text; **status is never color-only** — `DocsVersionBadge` includes text (`V1`/`Deferred`/`Frontend gap`), and success/failed states also use icons/text.
- **Dialogs/menus:** reuse shadcn focus-trap behavior for any doc dialog/search.
- **Contrast:** use existing tokens (accent on dark, muted text ≥ 4.5:1 where possible); test against WCAG.
- **Keyboard:** sidebar items, search, tabs, accordions, pager all keyboard-operable; Escape closes dialogs; `prefers-reduced-motion` honored.

---

## 12. Implementation Notes / Component Inventory

- **New route group:** add `/docs` and `/docs/:slug` as **public** routes in `App.tsx` (outside `RequireAuth`).
- **New components:** `frontend/src/components/docs/` — `DocsLayout`, `DocsTopNav`, `DocsSidebar`, `DocsToc`, `DocsSection`, `DocsCallout`, `DocsVersionBadge`, `DocsCodeBlock`, `DocsDiagram`, `DocsSteps`, `DocsTable`, `DocsCardGrid`, `DocsTabs`, `DocsPager`, `DocsSearch`.
- **Reuse:** shadcn/ui `Button`, `Badge`, `Card`, `Separator`, `Tooltip`, `Tabs`; custom CSS from `index.css` (`.lsection`, `.code-block`, `.bento-card`, `.badge`, `.live-dot`, `.logo`, `.step`, `.why-card`); Lucide icons.
- **No new backend APIs, no frontend feature code, no new dependency unless strictly required** (prefer hand-authored SVG over adding a Mermaid renderer; only add a Mermaid renderer if the team wants it, and treat it as an explicit dependency decision — not required for V1 docs).

### Data source for content

The docs content is **static, authored copy** (no live data fetching). No `TanStack Query` calls are needed for the docs pages. Execution-status and task-type tables are written once and kept honest against `docs/API.md` / `README.md`.

---

## 13. Open Questions / Decisions (to resolve at implementation time)

1. Should `/docs` redirect to `/docs/introduction` or render the intro itself? (Preference: render intro at `/docs`, keep a clean canonical path.)
2. Single long-scroll page per section vs. multiple sub-routes within a section (e.g. `/docs/getting-started/creating-a-workflow`)? (Preference: **flat** `/docs/:slug` with one page per top-level section + in-page TOC, to keep the router simple and the content focused.)
3. Mermaid renderer dependency? (Preference: **no** — hand-authored SVG for V1.)
4. Sidebar groups collapse behavior (accordion vs. always-visible). (Preference: always-visible with the active group emphasized.)
5. Should the authenticated app's sidebar "Documentation" open in the same tab or a new tab? (Preference: same tab; the docs are part of the product.)

---

## 14. Summary of V1 vs Deferred boundaries (quick reference)

- **Implemented V1 (docs may present as shipped):** auth, single-owner projects, workflow drafts/validate/immutable versions/activate-deactivate, persisted execution + task-run state, DAG concurrency + idempotency, durable queue + independent workers, leases/heartbeats/fencing/recovery/retries/timeouts/cancellation, manual/API/webhook/scheduled triggers, V1 task types (`http`, `transform`, `delay`, `conditional`, `email`), observability endpoints, retention, attempt-history UI, execution list/detail + polling, dark teal Inter/JetBrains Mono visual system, sample workflows with `delay`/`transform`/`conditional`.
- **Deferred / future:** SSO, RBAC/collaboration/roles, billing, worker/schedule/webhook **management UI**, real-time log/event streaming, worker/queue/metrics **UI**, AI-generated workflows, plugin marketplace, multi-region, Kubernetes/GPU execution, exactly-once, CLI/workflow-as-code.
- **Frontend gap (backend exists, UI does not surface):** worker/queue/metrics views, execution event/log streaming, schedule/webhook management.
