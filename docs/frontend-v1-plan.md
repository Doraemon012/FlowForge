# FlowForge — Frontend V1 Remaining Work Plan

This is the authoritative tracker for the remaining Frontend V1 work. It records what is already implemented, what is still needed, and the order to finish it in small batches. It is written against the **currently implemented backend API** — do not invent endpoints or surface capabilities the backend does not expose.

**Cross-reference:** `UI_IMPLEMENTATION_PLAN.md` defines the three UI phases (foundation/auth/shell, workflow management + builder, execution + observability + polish). This document is the current-status / remaining-work tracker for those phases.

---

## 1. Current Status — already complete (preserve)

### Foundation & auth
- React + TypeScript + Vite + Tailwind v4 + shadcn/ui + Lucide + React Router + TanStack Query + React Hook Form + Zod (package.json verified).
- Centralized API client (`api/client.ts`) with bearer auth, JSON parsing, `ApiError` normalization, and 401 → clear session + clear query cache.
- Auth store (localStorage-backed) + `useAuth` hook; `RequireAuth`/`RequirePublic` guards.
- Signup / Login / Logout flows. **Note:** the backend has no logout endpoint — logout is client-side only (`authStore.clear()` + `queryClient.clear()` + redirect). Preserve this; do not invent a logout API.

### Application shell
- `AppShell` with `Sidebar`, `TopBar` (breadcrumbs + search + command palette + account menu), responsive mobile drawer, sidebar collapse, Escape-to-close drawer.
- Command palette with ⌘K/Ctrl+K shortcut.

### Pages
- Landing (`/`), Login, Signup, Dashboard, Projects, Project Overview, Workflows, Workflow New, Workflow Detail (builder), Workflow Versions, Executions, Execution Detail, NotFound.
- Every authenticated page has loading skeletons (not blank screens), error states with retry, and empty states with a primary action. These are well-implemented — preserve them.

### Visual workflow builder (primary surface)
- XyFlow canvas with palette, config panel, node/edge rendering, drag-drop add, connect, move, delete (keyboard Delete/Backspace), pan/zoom/minimap.
- Client-side cycle detection + duplicate-edge guards; server validation errors associated to the relevant node; Task ID re-name updates edges.
- Mobile: palette and config become drawers. Desktop-first, reduced mobile editing — preserve.

### Projects & workflows
- Project create/edit/delete dialogs; project overview (details + workflows list).
- Workflow create dialog/form; workflow list cards; version history page + inspect dialog; activate/deactivate with confirmation.
- Sample workflow buttons ("Video Transcription", "Support Triage") create a project + a runnable workflow using only `delay`/`transform`/`conditional` tasks so Run works end-to-end. Preserve this honesty.

### Executions
- Execution list (per project), execution detail (header, status card, task-run list with output/failure), status badges for executions and task runs.
- Polling for active executions (2s, stops on terminal) via `useExecution`/`useTaskRuns`.

### Shared / UI primitives
- `EmptyState`, `ErrorState`, `PageHeader`, skeletons; shadcn/ui primitives (button, badge, card, dialog, dropdown, input, label, avatar, separator, tooltip, sonner).
- Existing tests: workflow form, project form, project overview, projects, workflows, workflow versions, graph-utils, TaskConfigPanel, utils.

---

## 2. Remaining V1 Work

### A. Distributed execution / attempt visibility ✅ DONE (Batch 1)
The backend exposes `GET /api/v1/executions/{id}/attempts` → `[]TaskAttempt` with `attempt_number`, `worker_id`, `status`, `failure_reason`, `failure_classification`, `started_at`, `heartbeat_at`, `lease_expires_at`, `completed_at`. The UI now surfaces attempt history on the execution detail page, which is the product's core promise ("durable execution / recovery / retries").

- ✅ API client + type (`TaskAttempt`) + `useExecutionAttempts` hook (polls while execution is active).
- ✅ `AttemptHistory` component on execution detail that groups attempts by `task_id` and renders a human timeline:
  - Attempt 1 / Worker lost → Attempt 2 / Succeeded (when a later attempt succeeds after a lost/failed one).
  - Shows `failure_classification` as transient/terminal, `worker_id`, and `completed_at`.
- ✅ Translates infrastructure behavior into user language (e.g. "The worker stopped responding. The task was re-queued automatically."). **Never** renders `lease_expires_at` as a raw lease token/row.
- ⚠️ The endpoint returns HTTP 501 when observability is not configured. The UI gracefully shows "Attempt history is not available for this deployment." instead of an error.

### B. Execution refresh / polling correctness
- Verify active-status coverage. Executions use `pending`/`running` (confirmed from backend metrics). Task runs use `pending`/`queued`/`running`... — ensure task-run polling keeps refreshing while a task is still `queued`/`running`/`leased` (it currently reads execution status from the query cache; the overall execution stays `running` so this is ordinarily fine, but confirm the dependency on the execution query being cached and not prematurely stale).

### C. Readable breadcrumbs ✅ DONE (Batch 2)
- `TopBar.buildCrumbs` labels segments generically and shows raw UUIDs for project/workflow/execution. ✅ Resolved project/workflow names via `useProject`/`useWorkflow` so breadcrumbs read `Projects / My Project / Workflows / My Workflow`. Added `parseRouteIds` helper. Fallback to ID when loading/unknown. Execution detail segment reads "Execution". Added `enabled: Boolean(id)` to `useProject` so TopBar doesn't fetch when no project ID is present.

### D. Sidebar navigation
- The "Observe → Runs" item points to `/app/projects` with the label "Runs" — misleading. Remove it or make it project-aware. There is no top-level executions route (executions are per-project). Choose a sensible fix; do not fabricate a global executions list that the API does not support.

### E. Publish → Activate → Run flow
- Backend `PublishWorkflow` creates an immutable version but does **not** auto-activate. The workflow stays `draft` and Run stays disabled until the user activates on the Versions page. Improve discoverability: after publish, guide toward activation (e.g. a "Manage versions" link in the success toast, or an inline "Activate" hint/action). Preserve the clear distinction: publish ≠ activate.

### F. Cleanup / consistency
- Remove dead code: `frontend/src/App.css` (the Vite template file — contains `.counter`, `.hero`, `#center`, `#next-steps`, `.ticks`; it is **not imported anywhere** and is dead), `frontend/src/components/workflows/TaskListEditor.tsx` (confirmed unused — the app uses the visual builder), and unused assets (`react.svg`, `vite.svg`, `hero.png` — all confirmed unused).
- **Do NOT touch `index.css`.** It is the intentional FlowForge design system (theme tokens, `.btn`, `.badge`, `.panel`, `.proj-card`, `.exec-head`, `.editor`, layout, landing, auth, modal/palette, react-flow overrides, responsive rules). The earlier note about "leftover Vite-scaffold CSS in `index.css`" is incorrect — that CSS lives in `App.css`. Preserve `index.css` in full.
- Two styling systems coexist (custom CSS in `index.css` — `.btn`, `.badge`, `.panel`, `.proj-card`, `.exec-head`, `.editor` — plus shadcn/ui primitives). Keep both but use them deliberately: custom CSS for bespoke surfaces (landing, editor, execution detail), shadcn/ui for primitives. Reconcile card/row rendering so a single list/card surface doesn't mix the two (e.g. `project-overview` uses `ui/card` while `workflows` list uses custom `.proj-card`-like rows).
- Command palette: remove the fake "Ask FlowForge AI" command (navigates to `/app` and is fabricated). Wire "Create project / Create workflow" commands to actually open the create dialogs (or a sensible pre-filled flow) rather than landing on `/app/projects`.

### G. Landing-copy consistency (informational, not a feature)
- The landing page advertises scheduling/webhooks/triggers ("Any trigger: Cron, webhooks, events, API") and a "visual + code" YAML/TS import. The authenticated app has **no** scheduling or webhook management UI (explicitly deferred). Adjust copy to avoid promising capabilities the app cannot exercise, or keep marketing copy but be aware of the mismatch. Do **not** build scheduling/webhook management in V1.

### H. Accessibility / motion passes
- Command palette items are `div`s with `onClick` — give them proper button/semantics + `aria-selected`/role and keep keyboard interaction.
- Sidebar `.sb-workspace` is a `div role="button"` with no Enter/Space handler — add keyboard activation.
- Confirm focus management for dialogs (shadcn handles this; verify custom ones). Existing motion respects `prefers-reduced-motion` — preserve for anything new.

### I. Observability surfaces (queue / workers / metrics) *(optional — non-blocking)*
The backend exposes `GET /workers` → `[]WorkerView`, `GET /queue` → `QueueView`, and `GET /metrics` → `Metrics` (auth-required, behind `s.observ != nil`). No UI consumes them today. These are operator/health surfaces, distinct from the core execution-reliability promise. **Do not build them as part of V1 core** — keep V1 focused on execution polish. If built, present real data only (no fabricated telemetry) and guard for HTTP 501 when `observ` is unconfigured. A light "System health" page reading queue depth, worker list, and key metrics is the right scope.

---

## 3. Small Implementation Batches (priority order)

Each batch is independently shippable; run `npm run build` (tsc + vite) and `npm test` after each.

**Batch 1 — Execution attempt history (distributed visibility)** ✅ COMPLETE
- ✅ `getExecutionAttempts(executionId)` → `/api/v1/executions/{executionId}/attempts`; `TaskAttempt` type; `useExecutionAttempts` hook (polls while execution is active).
- ✅ `AttemptHistory` component (group by task, render attempt timeline with worker/loss/retry language; classify transient/terminal).
- ✅ Wired into `ExecutionDetailPage` as an "Attempts" card (handles loading/error/empty + HTTP 501 graceful message).
- ✅ Tests: `AttemptHistory.test.tsx` (4 tests). Verification: `npm test` (53/53 pass), `npm run build` (tsc + vite) succeeds.

**Batch 2 — Readable breadcrumbs** ✅ COMPLETE
- ✅ `parseRouteIds` helper extracts project/workflow IDs from pathname; `buildCrumbs` resolves names via `useProject`/`useWorkflow`, falling back to IDs when loading/unknown. Execution detail segment reads "Execution".
- ✅ Added `enabled: Boolean(id)` to `useProject` (safe; prevents empty-ID fetches from TopBar on non-project pages).
- ✅ Verification: `npm run build` (tsc + vite) succeeds, `npm test` (53/53 pass).

**Batch 3 — Sidebar & command palette cleanup** ✅ COMPLETE
- ✅ Removed the misleading "Observe → Runs" sidebar item (it pointed to `/app/projects`; there is no top-level executions route). Sidebar now lists Overview + Projects only.
- ✅ Removed the fabricated "Ask FlowForge AI" command from the command palette.
- ✅ Wired "Create project…" to `/app/projects?create=1`, which the Projects page reads to open the `CreateProjectDialog` (via `useSearchParams`).
- ✅ Wired "Create workflow…" to open the new-workflow builder when a project is in context (`/app/projects/{projectId}/workflows/new`), falling back to the Projects page when no project is selected.
- ✅ Verification: `npm run build` (tsc + vite) succeeds; `npm test` (53/53 pass).

**Batch 4 — Publish → Activate flow** ✅ COMPLETE
- ✅ After a successful publish, the success toast now includes a "Manage versions" CTA action that navigates to the Versions page, guiding the user toward activation.
- ✅ Preserved the publish ≠ activate distinction: publishing still does not auto-activate, and the Run button stays disabled with the existing "Publish and activate a version to run" tooltip until a version is activated.
- ✅ Verification: `npm run build` (tsc + vite) succeeds; `npm test` (53/53 pass).

**Batch 5 — Execution detail polish** ✅ COMPLETE
- ✅ The execution detail header now shows the pinned workflow **version number** (e.g. "Version 3"), fetched via the existing `useWorkflowVersion` hook using `execution.workflow_version_id`; falls back to a short version ID while loading/unknown.
- ✅ Optional read-only execution graph deferred (non-blocking / stretch).
- ✅ Verification: `npm run build` (tsc + vite) succeeds; `npm test` (53/53 pass).

**Batch 6 — Dead code & style cleanup** ✅ COMPLETE
- ✅ Verified via grep that `App.css` (not imported), `TaskListEditor.tsx` (no imports besides its own definition), and `react.svg`/`vite.svg`/`hero.png` (no refs) were all unused, then deleted them.
- ✅ **Preserved `index.css` in full** — it is the intentional FlowForge design system, not leftover scaffold.
- ✅ Reconciled card/row styling: removed the `ui/card` wrapper from the project-overview Workflows section so it renders the custom `WorkflowCard` rows directly (matching the workflows list) instead of mixing a shadcn Card with custom rows. Details section remains a `ui/card` (single metadata surface).
- ✅ Verification: `npm run build` (tsc + vite) succeeds; `npm test` (53/53 pass).

**Batch 7 — Accessibility passes** ✅ COMPLETE
- ✅ Command palette items are now `<button type="button">` elements with `role="option"` and `aria-selected` (reflecting the active item), preserving the existing ArrowUp/Down/Enter keyboard interaction.
- ✅ Sidebar `.sb-workspace` now navigates to `/app` on click and handles Enter/Space keyboard activation (`onKeyDown`).
- ✅ Existing motion still respects `prefers-reduced-motion`; shadcn dialogs handle their own focus management.
- ✅ Verification: `npm run build` (tsc + vite) succeeds; `npm test` (53/53 pass).

**Batch 8 — Dashboard honesty (small)** ⏭️ DEFERRED (not cheap, would need N+1 or fabricated data)
- The dashboard is already honest: the hero shows the real project count from `useProjects` (`projects.length`) and shows no fabricated global execution/workflow stats.
- Adding per-project workflow/execution counts to project cards/hero would require fetching workflows + executions for every project (N+1 API calls) — not cheap, and there is no aggregate/global API. Deferred to avoid fabricated data and N+1 overhead.

**Batch 9 — Optional: Operator observability (queue / workers / metrics)** ⏭️ SKIPPED (optional / non-blocking)
- Read `/queue`, `/workers`, `/metrics` (guard for HTTP 501 when `observ` is unconfigured). Render a single "System health" page. Only render real data — never fake telemetry. Not required for V1 completeness; skipped to keep V1 focused on execution polish.

*(Batches 1–4 are the highest-value polish; 5–8 are secondary; Batch 9 is optional and non-blocking. The optional execution-graph in Batch 5 can be deferred without affecting V1 completeness.)*

---

## 4. Dependencies / API Constraints (verified against `internal/httpapi/router.go`)

- **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login` → `{user_id, access_token, token_type, expires_in}`. No logout endpoint. 401 mid-session should clear client auth state.
- **Projects:** `POST/GET /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/{id}`. `DELETE` → 204. Delete archives; status `active`/archived.
- **Workflows:**
  - `POST/GET /api/v1/projects/{pid}/workflows`
  - `GET/PATCH /api/v1/projects/{pid}/workflows/{wid}` — PATCH requires `name`, `description`, `definition` (tasks: `id`, `type`, `config` (arbitrary JSON object), `depends_on`).
  - `POST /api/v1/projects/{pid}/workflows/{wid}/validate` — 200 `{valid:true, errors:[]}`; on failure 422 `{code, message, errors[]}`.
  - `POST/GET /api/v1/projects/{pid}/workflows/{wid}/versions`; `GET /versions/{vid}`; `POST /versions/{vid}/activate` (204); `POST /versions/{vid}/deactivate` (204).
  - **Publish does NOT auto-activate.** Status transitions: `draft` → publish (adds version) → activate (sets `active_version_id`, status `active`) → deactivate (clears it, status `paused`).
- **Executions:**
  - `POST /api/v1/projects/{pid}/workflows/{wid}/executions` body `{version_id?, input?}` → 202 `Execution`. Supports `Idempotency-Key` header.
  - `GET /api/v1/projects/{pid}/executions`, `GET /api/v1/executions/{eid}`, `GET /api/v1/executions/{eid}/tasks`.
  - Execution statuses: `pending`, `running`, `completed`, `failed` (plus cancelled/timed_out/cancel_requested). `isExecutionActive` = pending|running is correct.
  - Task-run statuses: `pending`, `queued`, `running`, `succeeded`, `failed`, `blocked` (plus retry/cancel/timed_out).
- **Observability** (backed by `s.observ != nil`): `GET /executions/{eid}/events` → `[]Event`; `/executions/{eid}/logs` → `[]LogEntry`; `/executions/{eid}/attempts` → `[]TaskAttempt`; `/workers` → `[]WorkerView`; `/queue` → `QueueView`; `/metrics` → `Metrics`. All auth-required. Currently not consumed by the frontend.
- **Schedules & webhooks:** CRUD endpoints exist (under workflows) + public `POST /api/v1/webhooks/{id}`. **Do not build scheduling/webhook management UI in V1** — it is explicitly deferred.

---

## 5. Known Decisions to Preserve

- **Backend is authoritative.** After any mutation, reconcile via TanStack Query invalidation (already done). Do not treat local editor state as canonical.
- **Do not invent capabilities.** Only use APIs that exist. Never fabricate data or features (e.g. the "Ask AI" command). If an observability surface is built, it must render real `/workers`, `/queue`, `/metrics` data and guard for HTTP 501 when `observ` is unconfigured — never show fake telemetry.
- **Translate, don't expose internals.** Distributed execution info must be human-readable. Never expose lease tokens, DB locks, raw queue records, or internal transaction details as ordinary UI.
- **Visual builder is the primary surface.** Desktop-first; mobile gets a reduced drawer-based editing experience. Preserve this.
- **Preserve the FlowForge visual language** (dark theme, teal accent, Inter + JetBrains Mono, restrained motion, subtle borders). Do not replace it with a generic SaaS template.
- **Two styling systems intentionally coexist** — custom CSS for bespoke surfaces, shadcn/ui for primitives. Use them deliberately; avoid mixing them within a single list/card row.
- **Sample workflows use only runnable built-in task types** (`delay`, `transform`, `conditional`) so Run works end-to-end. Do not add a fake http/email step to samples.
- **Execution polling** is controlled (2s), stops on terminal state, tolerates transient failures. Preserve.
- **Cleanup caution:** only remove genuinely unused Vite-template CSS/files. Do not delete the intentional custom classes (`.btn`, `.badge`, `.editor`, `.exec-head`, `.proj-card`).
- **Verification:** run `npm run build` and `npm test` after each batch; the test suite must pass and the app must not render blank/error screens.
