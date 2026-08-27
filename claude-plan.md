# FlowForge — Documentation Audit & Phase 1 Plan

## Context

This project (FlowForge) currently exists only as documentation — no source code, no dependency manifests, no CI, and no git repository yet (`git status` context confirms "Is a git repository: false"). The user asked me, acting as principal architect, to (1) fully audit the existing documentation for contradictions/duplication/scope creep before any code is written, (2) explain the system in plain language, and (3) produce a concrete, boundary-respecting Phase 1 plan. This is pure planning output — no files are edited as part of this turn. The documentation-refinement recommendations in Section 2/3 below are proposed changes to execute after this plan is approved, not changes already made. Tech stack was clarified with the user: **Go, PostgreSQL** (recommendation below: `net/http` + `chi` router over Fiber, for idiomatic-stdlib-first alignment with AGENTS.md's "avoid unnecessary abstractions" principle — the user can override).

---

# 1. Repository Understanding

**State:** Documentation-only. No application code, no tests, no dependency files, no CI, not yet a git repository.

| Path | Status |
|---|---|
| `AGENTS.md` | Complete, well-formed. The actual rules-of-engagement doc — architectural rules, testing/security/observability requirements, dev workflow, definition of done. |
| `README.md` | Empty (0 bytes). |
| `docker-compose.yml` | Empty (0 bytes). |
| `.env.example` | Empty (0 bytes). |
| `sc.py` | A one-off Python script that scaffolded the `docs/` file tree with placeholder headers. Its job is done (all files now have real content) — it's not part of the application and can be deleted once the doc refactor lands. |
| `docs/DESIGN.md` | 6,231 lines. Contains 4–5 distinct documents concatenated together (see Section 2). |
| `docs/IMPLEMENTATION_PLAN.md` | 11 phases, clean, well-scoped — the strongest doc in the set. |
| `docs/API.md`, `docs/SECURITY.md`, `docs/OBSERVABILITY.md`, `docs/TESTING.md` | Bullet-point topic checklists only — no actual specification content yet. |
| `docs/DATA_MODEL.md`, `docs/EXECUTION_ENGINE.md` | Real but thin drafts — a fraction of the detail already sitting (better-written) inside `DESIGN.md`. |
| `docs/adr/001-004` | Concise, consistent with each other and with AGENTS.md. No contradictions found here. |

Nothing in the current repo constrains architecture choices — this is a clean slate for Phase 1.

---

# 2. Documentation Audit

## A. Structural problem: `DESIGN.md` is not one document
It's an unedited concatenation of: an Executive Summary, a full second "PRODUCT REQUIREMENTS DOCUMENT" (vision/tagline/personas/success metrics — largely restating the Executive Summary in marketing prose), a "System Architecture & Domain Design" doc, a "Technical Specification" doc, and an "Implementation Blueprint" that reads like a pasted chat transcript — it literally contains the leftover sentence *"Yep. We've actually covered the design doc through the major architecture, runtime behavior..."* confirming it was never cleaned up.

## B. Contradiction: three different, mutually inconsistent phase/build-order schemes
1. `DESIGN.md` §21 "Development Phases" — **8 phases** (Control Plane Foundation → Workflow Execution → Distributed Execution → Reliability → Scheduling → Observability → Extensibility → Production Hardening).
2. `DESIGN.md`'s trailing "Implementation Blueprint → build order" — **10 phases**, differently grouped (e.g., puts heartbeats/leases as their own phase after "multiple workers" rather than folding them into one "Distributed Execution" phase).
3. `docs/IMPLEMENTATION_PLAN.md` — **11 phases**, most granular, cleanly written, each with explicit objective/deliverables/exit-criteria.

**Resolution:** `IMPLEMENTATION_PLAN.md` becomes the single sequencing authority (this matches the documentation responsibility boundary the user specified). Delete `DESIGN.md` §21 and the trailing build-order list; replace with one sentence pointing to `IMPLEMENTATION_PLAN.md`.

## C. Duplicated content that belongs in the specialized docs, not `DESIGN.md`
- **Domain model** — `DESIGN.md` §6 (15 detailed subsections, attributes, lifecycles, ER diagram) vs. `DATA_MODEL.md` (thin restatement). → `DATA_MODEL.md` becomes canonical; `DESIGN.md` keeps one paragraph + the ER diagram.
- **API/service contracts** — `DESIGN.md` §8 fully specifies 9 services (responsibilities/inputs/outputs/failure scenarios) while `API.md` is an empty checklist. → Move §8's content into `API.md` wholesale.
- **Execution engine semantics** — `DESIGN.md` §12–14 (orchestrator responsibility, parallelism, concurrency limits, backpressure, fairness, retry/backoff, idempotency, worker lifecycle, lease/heartbeat mechanics) vs. `EXECUTION_ENGINE.md` (a real but thinner draft missing the concurrency-limits/backpressure/fairness material entirely). → Merge into `EXECUTION_ENGINE.md`; `DESIGN.md` keeps only the "north star" summary diagram.
- **Security** — `DESIGN.md` §16 (auth, authz, credential isolation, secret redaction, webhook security, rate limiting, abuse prevention, sandboxing) vs. `SECURITY.md` (empty checklist). → Move wholesale.
- **Observability/logging identifiers** — stated in `DESIGN.md` §15.7, `OBSERVABILITY.md`, and `AGENTS.md` in three overlapping forms. → Consolidate detail into `OBSERVABILITY.md`; `AGENTS.md`'s short version stays as a rule-of-thumb, cross-referencing the detailed doc.
- **The demo/acceptance scenario is stated three separate times** — `DESIGN.md` §22 (Acceptance Criteria), §28 ("V1 Definition of Done" — the "10 concurrent executions, kill a worker, recover, complete" script), and the Blueprint's "§14 What We Should Demo" (a video-pipeline walkthrough). → Consolidate into one canonical scenario.

## D. Content to delete outright (doesn't belong in any technical doc)
- §"16. The Actual Resume Value" and §"17. The Resume Bullet We Are Ultimately Aiming For" — personal career-coaching notes, not architecture.
- The stray sentence "Yep. We've actually covered..." — chat artifact.
- The tagline and the second "Vision"/"Why This Product Exists" PRD-style restatement — duplicates the Executive Summary in marketing prose.

## E. Scope creep vs. the stated V1 boundary
- §3.1 "User and Project Management" specifies multi-user collaboration (invite collaborators, manage roles). Nothing in Acceptance Criteria, Success Metrics, or `AGENTS.md`'s core-requirements list actually requires collaboration — only **project isolation** is required. Recommend narrowing V1 to single-owner-per-project and moving collaborator/role invites to Future Enhancements. Zero impact on the 12 protected distributed-systems requirements.
- §3.17 "Task/Plugin Registry" and §5.9 describe a dynamic plugin ecosystem with capability negotiation/versioning — heavier than the doc's own Key Risk 3 mitigation ("build only several high-value task types"). Recommend narrowing V1 language to "a small, fixed set of built-in task types behind a stable internal interface"; dynamic third-party plugin loading moves fully to Future Enhancements (where a "Plugin SDK" already correctly lives).

## F. Terminology inconsistency
`AGENTS.md` and ADR-001's title say **"control plane / execution plane"**; `DESIGN.md`'s diagrams and prose say **"Control Plane / Data Plane"** for the identical split. Recommend standardizing on "control plane / execution plane" everywhere (matches the top-level rules doc).

## G. Genuine gap
No phase in `IMPLEMENTATION_PLAN.md` explicitly schedules authentication/authorization, even though Acceptance Criteria and `AGENTS.md`'s Security Requirements both require enforced project-level access control. Recommend making this explicit when the docs are refined: a minimal identity concept is scheduled in Phase 1/2, and enforcement is scheduled explicitly in Phase 2 (Workflow Management, which is the phase that already owns "projects").

## H. Correctly left open (no action needed for Phase 1)
Queue technology, exact persistence engine beyond "relational," workflow definition format (visual/JSON/hybrid), and the dashboard's real-time transport mechanism are all explicitly deferred in the docs themselves and don't block Phase 1.

---

# 3. Refined Architecture Summary

Proposed shape of `DESIGN.md` after refinement (to be executed as approved follow-up, not during this planning turn):

**Keeps:** one Executive Summary (problem, goals, non-goals, target users), condensed functional/non-functional requirements (bulleted, cross-referencing detail docs instead of repeating them), one high-level architecture diagram (control plane / execution plane, terminology fixed), a short major-components list (responsibilities only, contracts move to `API.md`), a short domain-concepts paragraph + ER diagram (detail moves to `DATA_MODEL.md`), 2–3 canonical user/data flows (webhook trigger, and the worker-failure-recovery flow — the single most important flow per the doc's own Key Risk 2), the Key Architectural Decisions (condensed, cross-referencing the ADRs instead of re-arguing them), a trimmed V1 scope (per Section 2.E above), and one consolidated acceptance/demo scenario.

**Moves out:** API contracts (§8) → `API.md`; detailed domain model (§6) → `DATA_MODEL.md`; execution semantics (§12–14) → `EXECUTION_ENGINE.md`; security considerations (§16) → `SECURITY.md`; logging identifiers (§15.7) → `OBSERVABILITY.md`; development phases (§21 + trailing blueprint) → deleted in favor of `IMPLEMENTATION_PLAN.md`.

**Deletes:** resume-value sections, chat artifacts, duplicate PRD-style prose.

**Net effect:** `DESIGN.md` shrinks from ~6,200 lines to an estimated 800–1,200 lines while preserving every one of the 12 protected distributed-systems requirements and every acceptance criterion.

---

# 4. FlowForge Explained Simply

1. **What it is:** A platform where you define a multi-step automation ("workflow") once, and the platform reliably runs it — retrying failures, distributing work across machines, and recording exactly what happened — instead of you hand-rolling cron jobs, background workers, and custom retry logic for every process.
2. **Who uses it:** Backend/platform/DevOps/AI engineers who need reliable async automation (email delivery, file/video pipelines, ETL, scheduled maintenance, AI inference chains) without building orchestration infrastructure themselves.
3. **What an end user can do:** Create a project, define a workflow as a sequence/graph of tasks, publish an immutable version of it, trigger it manually/via API/via webhook/on a schedule, watch it execute live, inspect every task attempt afterward, and cancel or retry as needed.
15. **Workflow versioning:** Editing a workflow never mutates the version an in-flight execution is running against — editing creates a *new* version; the old one stays frozen and attached to whatever executions already reference it. This is why "the developer edits a workflow mid-run" can never change already-running behavior.
16. **The scheduler:** A component that watches time-based schedules ("every day at 02:00") and, when one is due, creates an execution request — nothing more. It never executes a task itself; it just hands off to the same trigger→orchestrator path everything else uses.
17. **The webhook trigger:** An HTTP endpoint external systems call to start a workflow. It authenticates the caller, validates the payload, creates an execution record, and returns immediately — the actual workflow work happens asynchronously afterward.
18. **The execution dashboard:** For any execution, shows per-task status (pending/running/succeeded/failed/retrying), which worker ran each attempt, attempt history (not just the final outcome — "attempt 1 timed out, attempt 2 succeeded" must be visible), logs, timestamps, and failure reasons — updating live without a manual page refresh.

---

# 5. End-to-End Execution Flow

4. **Trigger fires** (manual click, API call, webhook POST, or scheduler tick) → the trigger's only job is to produce an **execution request**; it never runs a task itself.
5. **The API/control plane** receives the request, creates a persisted `WorkflowExecution` row in `Pending` state, and returns an execution ID immediately — it does **not** hold the HTTP connection open while the workflow runs. This is the load-bearing rule in the whole system: control operations are synchronous, workflow *work* is always asynchronous.
6. **The orchestrator** loads the workflow's immutable version + current execution state and answers exactly one question: *"given what's completed so far, what's now eligible to run?"* Initially that's the tasks with no unmet dependencies. It never executes anything itself — it only decides and enqueues.
7. **The queue** sits between orchestrator and workers purely as a durability/buffering boundary — it lets workers scale independently of the API and absorbs bursts (100,000 queued tasks against 3 workers is fine; the queue just gets deeper, not the workers overloaded).
8. **Workers** pull tasks off the queue, acquire a temporary **lease** on each one, execute the task's actual logic (HTTP call, email, transform, etc.), and report success/failure back — after which they return to the pool for more work.
9. **Concurrency:** independent tasks (no dependency between them) can be leased by different workers simultaneously — e.g. after task A completes, if both B and C depend only on A, the orchestrator enqueues both, and two different workers can run them in parallel. A downstream task D that depends on both only becomes eligible once both terminate successfully.
10. **Retries:** a task's retry policy defines max attempts, backoff delay, and which failure categories are retryable. On a retryable failure, a new attempt is scheduled (with increasing backoff) rather than failing the whole task immediately — attempt history is preserved, not overwritten, so "failed twice then succeeded" stays visible.
11. **Task leases:** when a worker claims a task, it doesn't own that task forever — it owns it for a bounded lease window. This exists specifically so that if the worker dies, ownership can be reclaimed instead of the task being stuck "belonging" to a worker that no longer exists.
12. **Heartbeats:** while executing, a worker periodically signals "I'm still alive and still working on this." As long as heartbeats keep arriving, the lease gets extended/considered valid.
13. **Worker crash:** heartbeats stop arriving. Once the lease's expiration passes without a heartbeat, the platform treats the task as abandoned — it does not wait indefinitely or require manual intervention.
14. **Recovery by another worker:** the abandoned task becomes eligible for acquisition again (following its retry policy); a different worker claims it and executes a fresh attempt. The execution history then explicitly shows: "Attempt 1 — Worker A — failed (worker lost)", "Attempt 2 — Worker B — succeeded." This is the single demonstration that proves the system is actually distributed rather than just "two processes pointed at one queue."

---

# 6. What Makes FlowForge Technically Valuable

19. **What makes this a distributed-systems project (not just a CRUD app with a queue attached):** it implements the real primitives that distinguish "background jobs" from "distributed orchestration" — task leasing (not "first worker to grab it owns it forever"), heartbeat-based liveness detection, failure recovery through lease expiration + re-queueing, at-least-once semantics with an explicit idempotency story (rather than pretending exactly-once is achievable), durable state that survives process/worker restarts, and genuine concurrent execution across independent workers.
20. **Why it's more valuable than another RAG/CRUD project on the resume:** the existing resume already demonstrates backend (Django/Flask/Node/APIs), AI (RAG/LangChain), and mobile — but nothing demonstrates distributed execution, worker coordination, fault tolerance, or task orchestration. FlowForge is specifically the project that fills that gap, and it's provable via one concrete, repeatable demo (kill a worker mid-task, watch another worker recover it) rather than a vague "distributed systems" bullet with nothing behind it.

---

# 7. V1 Scope

**In scope (the 12 protected distributed-systems requirements, preserved exactly):** DAG-based dependency execution, asynchronous task processing, queue-based worker dispatch, concurrent workers, retries, timeouts, task leasing, heartbeats, worker-failure recovery, scheduling, webhook/manual/API triggers, execution history, and observability — plus workflow definitions, immutable versioning, and a small fixed set of built-in task types (HTTP, Transform, Delay, Conditional, Webhook trigger, Email).

**Explicitly out of V1** (per the docs' own Non-Goals, reconciled with Section 2.E's trims): enterprise billing, marketplace, multi-region orchestration, enterprise SSO, Kubernetes-native orchestration, large-scale multi-tenancy, dozens of integrations, AI-generated workflows, exactly-once execution guarantees, a sophisticated drag-and-drop visual editor, a dynamic third-party plugin registry (fixed built-in task types only), and multi-user project collaboration (invites/roles — single owner per project for V1).

---

# 8. Phase 1 Objective

At the end of Phase 1, FlowForge is a running Go service backed by PostgreSQL that:
- boots locally with one documented command,
- exposes a `GET /health` endpoint that reports real DB connectivity (not a hardcoded 200),
- has a real migration mechanism (not a one-off script) with one applied migration,
- has exactly one persisted domain entity (`User`) proving the persistence layer works end-to-end,
- has a green automated test suite covering config, persistence, and the health endpoint,
- has a filled-in `README.md`, `.env.example`, and `docker-compose.yml` (currently all empty).

**No workflow, execution, task, queue, or worker concept exists yet.** Per the docs' own Phase 2 ownership, `Project` also does *not* belong in Phase 1 — `IMPLEMENTATION_PLAN.md`'s Phase 2 ("Workflow Management") explicitly lists "projects" as its own deliverable. Phase 1's "core domain entities" is interpreted minimally as just `User` (the root of the domain model per `DATA_MODEL.md`), to avoid smuggling Phase 2/3 concepts in early. This interpretation is a judgment call — flag if a different minimal entity is preferred.

---

# 9. Phase 1 Architecture

**Deliverables:**
- Git repository initialized (currently not a git repo at all).
- Go module + a straightforward layered structure: an entrypoint, a config package (env-based, fail-fast on missing required vars), a db package (connection pooling + migration runner), a domain package (`User` entity + repository interface + Postgres implementation), an http package (router + health handler).
- `docker-compose.yml` filled in with a single Postgres service.
- `.env.example` filled in with the actual required variables (DB connection string, port, etc.).
- One migration creating the `users` table.
- `README.md` with setup/run/test instructions that actually work from a fresh clone.

**Dependencies:** None upstream — this is the first phase. Everything in Phase 2+ (Projects, Workflows, Execution) depends on the config/db/http scaffolding and migration mechanism established here.

**Recommended concrete choices** (implementation details, not architecture — override freely): `chi` router over `net/http` (idiomatic, minimal, composes via standard middleware — avoids the "unnecessary abstraction" `AGENTS.md` warns against; Fiber is a reasonable alternative if Express-like ergonomics are preferred), `pgx` as the Postgres driver, `golang-migrate` or `goose` for migrations (a real tool, not another throwaway script like `sc.py`). The app itself runs natively via `go run` in Phase 1 — only Postgres is containerized; full app containerization is correctly deferred to Phase 10 (Production Hardening) per `IMPLEMENTATION_PLAN.md`.

---

# 10. Phase 1 Implementation Order

1. Documentation refinement (Section 2/3 above) — lands first so implementation starts from a consistent source of truth, per `AGENTS.md`'s own "read the docs before making decisions" rule.
2. `git init` + initial commit of existing docs.
3. Go module init + minimal repo layout.
4. Config package (load + validate env vars, fail fast with a clear error on missing required config).
5. `docker-compose.yml` (Postgres) + `.env.example` filled in.
6. DB connection package + migration runner wiring.
7. First migration: `users` table.
8. `User` domain entity + repository (Postgres-backed).
9. HTTP server + router + `/health` endpoint (checks DB connectivity, not just process liveness).
10. Tests: unit (config validation, domain logic) + integration (DB round-trip, health endpoint against a real Postgres instance).
11. `README.md` with real setup/run/test instructions.
12. Manual end-to-end validation pass (Section 13).

---

# 11. Phase 1 Todo Checklist

- [ ] Refine `DESIGN.md`/`API.md`/`DATA_MODEL.md`/`EXECUTION_ENGINE.md`/`SECURITY.md`/`OBSERVABILITY.md`/`TESTING.md`/`IMPLEMENTATION_PLAN.md` per Section 2/3.
- [ ] `git init`, initial commit.
- [ ] `go mod init`, base package layout.
- [ ] Config loader with validation + fail-fast behavior; unit tests for both valid and missing-var cases.
- [ ] `docker-compose.yml`: Postgres service with a named volume, healthcheck.
- [ ] `.env.example`: all variables the app actually reads, with safe placeholder values.
- [ ] DB connection package (pooled, with a configurable timeout).
- [ ] Migration tool wired in; `migrations/0001_init.sql` creating `users`.
- [ ] `User` domain entity + repository interface + Postgres implementation.
- [ ] Repository unit/integration tests (create, fetch, uniqueness constraint if applicable).
- [ ] HTTP router + `GET /health` returning DB-aware status (200 healthy / 503 degraded).
- [ ] API-level test for `/health` in both healthy and DB-unreachable scenarios.
- [ ] `README.md`: prerequisites, setup, run, test instructions verified against a truly fresh clone.
- [ ] Full test suite green (`go test ./...`).
- [ ] Manual validation checklist (Section 13) completed.

---

# 12. Phase 1 Testing Plan

- **Unit tests:** config parsing/validation (valid config loads; missing/invalid required var fails with a clear error, not a panic or silent default); `User` domain validation logic, if any (e.g., required fields).
- **Integration tests:** DB connectivity against a real Postgres instance (via `docker-compose` or a testcontainer); migration application from a clean database (must succeed) and idempotency (re-running migrations must not error or duplicate schema); `User` repository round-trip (insert → fetch → matches).
- **API tests:** `GET /health` returns 200 with DB status "ok" when Postgres is reachable; returns a non-200 (503) with a clear status body when Postgres is unreachable (simulate by pointing config at a closed port).
- **Persistence tests:** covered under integration tests above — repository create/read, and a constraint test (e.g., duplicate unique field rejected) if `User` has any uniqueness requirement.
- **Validation tests:** app fails fast at startup (not at first request) if required config is missing — this matters because Phase 1's whole point is "the foundation is provably solid," not "it happens to work when configured correctly."

---

# 13. Phase 1 Validation Checklist

- [ ] `docker-compose up -d` brings up Postgres cleanly on a fresh machine.
- [ ] App boots with `go run ./cmd/...` (or documented equivalent) using only `.env.example` copied to `.env`.
- [ ] `curl localhost:<port>/health` returns 200 with a JSON body indicating DB connectivity.
- [ ] Stopping the Postgres container and re-hitting `/health` returns a non-200 with a clear degraded status (proves the health check is real, not hardcoded).
- [ ] Migrations apply cleanly against a brand-new empty database.
- [ ] Re-running migrations against an already-migrated database does not error.
- [ ] `go test ./...` passes with no skipped/pending tests.
- [ ] No secrets or credentials committed (`.env` itself is gitignored; only `.env.example` is tracked).
- [ ] A reviewer following only `README.md` on a clean clone can get the app running without asking a question.

---

# 14. Phase 1 Exit Criteria

Directly mirrors `IMPLEMENTATION_PLAN.md`'s own Phase 1 exit criteria, made objective:
- Application starts successfully from a documented command.
- Database is reachable and connectivity is verifiable via `/health`.
- Migrations run successfully and are safely re-runnable.
- Automated test suite passes in full.
- Health check accurately reflects real DB state (not a stub).

---

# 15. Risks / Open Decisions

- **Scope creep risk:** the temptation to add `Project` or even `Workflow` scaffolding "since we're already here." Mitigation: hold the line at `User`-only per Section 8's interpretation; `IMPLEMENTATION_PLAN.md` explicitly assigns Projects to Phase 2.
- **Under-scoping risk:** if Phase 1's migration/config patterns are too ad hoc, Phase 2 inherits friction. Mitigation: use a real migration tool (`golang-migrate`/`goose`), not a throwaway script — `sc.py` is a cautionary example already sitting in this repo of what happens when a "quick script" approach is used for something that should be a real tool.
- **Router/framework lock-in risk:** picking something that fights later needs (webhooks needing raw body access, dashboard needing streaming/SSE for live updates). Mitigation: `chi`/`net/http` composes cleanly with both; avoid an all-in-one framework that assumes strictly synchronous request/response.
- **Documentation drift risk:** if the doc refactor (Section 2/3) doesn't land before/alongside Phase 1 code, `AGENTS.md`'s own "don't leave docs describing behavior the implementation doesn't support" rule is violated from day one.
- **Open decision (not blocking Phase 1):** whether Phase 1's minimal entity should be `User` alone, as recommended, or something even more minimal (e.g., no domain entity at all, just a migrations-only proof). Flagging explicitly since `IMPLEMENTATION_PLAN.md`'s own wording ("core domain entities," plural) is ambiguous here.
- **Open decision (not blocking Phase 1):** authentication mechanism for the eventual control-plane API is unspecified anywhere in the docs (Section 2.G). Doesn't need resolving now — Phase 1 has no protected endpoints — but should be decided before Phase 2 needs to enforce project isolation.

---

# 16. Files Expected to Change

**New:**
- `go.mod`, `go.sum`
- `cmd/<service>/main.go` (entrypoint)
- `internal/config/` (loader + validation + tests)
- `internal/db/` (connection pool + migration runner)
- `migrations/0001_init.sql` (or equivalent, per chosen migration tool's convention)
- `internal/domain/user.go` + repository interface/implementation + tests
- `internal/http/` (router setup + health handler + tests)

**Modified:**
- `README.md` — filled in with overview + setup/run/test instructions.
- `docker-compose.yml` — filled in with a Postgres service.
- `.env.example` — filled in with real required variables.
- `docs/DESIGN.md`, `docs/API.md`, `docs/DATA_MODEL.md`, `docs/EXECUTION_ENGINE.md`, `docs/SECURITY.md`, `docs/OBSERVABILITY.md`, `docs/TESTING.md` — refactored per Section 2/3.
- `docs/IMPLEMENTATION_PLAN.md` — minor addition making auth/authz scheduling explicit (Section 2.G).

**Candidate for removal (flagged, not auto-deleted):**
- `sc.py` — its scaffolding job is complete; superseded by real content in every file it generated.

No folder structure above is mandatory — it's illustrative of a reasonable layered Go layout, not a rigid prescription.
