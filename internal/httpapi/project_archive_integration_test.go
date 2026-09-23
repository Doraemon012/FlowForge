package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/schedule"
	"github.com/neyati/flowforge/internal/scheduler"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/webhook"
	"github.com/neyati/flowforge/internal/workflow"
)

// This file pins the behaviour of archiving a project. Deleting archives the
// row instead of removing it: the project, its workflows, its versions and its
// execution history all survive and stay viewable - which is what makes the
// archive reversible - while every path that starts new work is refused. That
// refusal lives in the repository, so no trigger and no handler can bypass it.

// deleteProjectViaAPI archives a project through the public API, which is how
// the UI deletes it.
func deleteProjectViaAPI(t *testing.T, handler http.Handler, token, projectID string) {
	t.Helper()
	response := requestJSON(handler, http.MethodDelete, "/api/v1/projects/"+projectID, nil, token)
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete project status = %d, body = %s", response.Code, response.Body.String())
	}
}

// TestArchivedProjectBlocksNewRunsButKeepsHistoryReadable is the core archive
// contract, end to end: archive, then a run is refused, then restore, then the
// same workflow runs again.
//
// Archiving retires a project without destroying it. Everything the owner
// already has - the project, its workflows, their versions and the run history -
// stays readable, because that is both what makes the archive reversible and
// what lets the owner see what they are restoring. What stops is new work, and
// it is stopped by the server rather than by hiding rows, so no trigger and no
// handler can route around it.
func TestArchivedProjectBlocksNewRunsButKeepsHistoryReadable(t *testing.T) {
	handler, pool := phase8Handler(t)
	token := registerAndLogin(t, handler, "archive-blocks-"+time.Now().Format("150405.000000000")+"@example.com", "Archive Blocks")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	base := "/api/v1/projects/" + projectID + "/workflows/" + workflowID

	// A run works while the project is active. That is the baseline the
	// post-archive assertions are measured against.
	before := requestJSON(handler, http.MethodPost, base+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	if before.Code != http.StatusAccepted {
		t.Fatalf("execution before archive status = %d, body = %s", before.Code, before.Body.String())
	}
	var firstRun execution.Execution
	if err := json.NewDecoder(before.Body).Decode(&firstRun); err != nil {
		t.Fatal(err)
	}
	waitForExecution(t, handler, token, firstRun.ID.String(), "completed")

	deleteProjectViaAPI(t, handler, token, projectID)

	// The project is archived, not gone. It is still readable and still listed,
	// which is how the owner finds it again to restore it.
	detail := requestJSON(handler, http.MethodGet, "/api/v1/projects/"+projectID, nil, token)
	if detail.Code != http.StatusOK {
		t.Fatalf("archived project detail status = %d, body = %s", detail.Code, detail.Body.String())
	}
	var archived project.Project
	if err := json.NewDecoder(detail.Body).Decode(&archived); err != nil {
		t.Fatal(err)
	}
	if archived.Status != "archived" {
		t.Fatalf("archived project status = %q, want %q", archived.Status, "archived")
	}

	list := requestJSON(handler, http.MethodGet, "/api/v1/projects", nil, token)
	if list.Code != http.StatusOK {
		t.Fatalf("project list status = %d", list.Code)
	}
	var projects []project.Project
	if err := json.NewDecoder(list.Body).Decode(&projects); err != nil {
		t.Fatal(err)
	}
	var listed bool
	for _, item := range projects {
		if item.ID.String() == projectID {
			listed = true
		}
	}
	if !listed {
		t.Fatalf("archived project %s is missing from the listing", projectID)
	}

	// The workflow, its versions and the run history all stay viewable.
	for _, readable := range []string{
		"/api/v1/projects/" + projectID + "/workflows",
		base,
		base + "/versions",
		"/api/v1/projects/" + projectID + "/executions",
	} {
		if response := requestJSON(handler, http.MethodGet, readable, nil, token); response.Code != http.StatusOK {
			t.Fatalf("GET %s on an archived project status = %d, want %d (body = %s)", readable, response.Code, http.StatusOK, response.Body.String())
		}
	}

	// Starting work is refused, and refused by the server with a reason the
	// client can act on rather than a generic failure.
	blocked := requestJSON(handler, http.MethodPost, base+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	if blocked.Code != http.StatusConflict {
		t.Fatalf("run in archived project status = %d, want %d (body = %s)", blocked.Code, http.StatusConflict, blocked.Body.String())
	}
	var blockedBody struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(blocked.Body).Decode(&blockedBody); err != nil {
		t.Fatal(err)
	}
	if blockedBody.Code != "project_archived" {
		t.Fatalf("run in archived project error code = %q, want %q", blockedBody.Code, "project_archived")
	}

	// The refusal is real: no second execution exists.
	var executions int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM executions WHERE project_id = $1`, projectID).Scan(&executions); err != nil {
		t.Fatalf("count executions: %v", err)
	}
	if executions != 1 {
		t.Fatalf("archived project has %d executions, want 1", executions)
	}

	// The write side is closed too: an archived project cannot be renamed,
	// edited or published into.
	writes := []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodPatch, base, map[string]any{"name": "Renamed", "definition": definition}},
		{http.MethodPost, base + "/versions", nil},
		{http.MethodPatch, "/api/v1/projects/" + projectID, map[string]any{"name": "Renamed"}},
	}
	for _, write := range writes {
		if response := requestJSON(handler, write.method, write.path, write.body, token); response.Code != http.StatusNotFound {
			t.Fatalf("%s %s on an archived project status = %d, want %d (body = %s)", write.method, write.path, response.Code, http.StatusNotFound, response.Body.String())
		}
	}

	// Nothing was removed: the rows are all still there, which is what makes the
	// restore below a status transition rather than a rebuild.
	var storedStatus string
	if err := pool.QueryRow(context.Background(), `SELECT status FROM projects WHERE id = $1`, projectID).Scan(&storedStatus); err != nil {
		t.Fatalf("archived project row is missing: %v", err)
	}
	if storedStatus != "archived" {
		t.Fatalf("project status = %q, want %q", storedStatus, "archived")
	}
	var remainingWorkflows int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM workflows WHERE id = $1`, workflowID).Scan(&remainingWorkflows); err != nil {
		t.Fatalf("count workflows: %v", err)
	}
	if remainingWorkflows != 1 {
		t.Fatalf("workflow row count = %d, want 1 (archiving keeps it, it does not cascade)", remainingWorkflows)
	}

	// Restoring re-enables normal operation: the very same workflow and version
	// run again, with nothing recreated in between.
	restore := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/restore", nil, token)
	if restore.Code != http.StatusOK {
		t.Fatalf("restore project status = %d, body = %s", restore.Code, restore.Body.String())
	}
	var restored project.Project
	if err := json.NewDecoder(restore.Body).Decode(&restored); err != nil {
		t.Fatal(err)
	}
	if restored.Status != "active" {
		t.Fatalf("restored project status = %q, want %q", restored.Status, "active")
	}

	after := requestJSON(handler, http.MethodPost, base+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	if after.Code != http.StatusAccepted {
		t.Fatalf("run after restore status = %d, body = %s", after.Code, after.Body.String())
	}
	var secondRun execution.Execution
	if err := json.NewDecoder(after.Body).Decode(&secondRun); err != nil {
		t.Fatal(err)
	}
	waitForExecution(t, handler, token, secondRun.ID.String(), "completed")

	// Restoring an already-active project changes nothing, so it is reported as
	// not found rather than silently succeeding.
	if again := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/restore", nil, token); again.Code != http.StatusNotFound {
		t.Fatalf("second restore status = %d, want %d", again.Code, http.StatusNotFound)
	}
}

// TestArchivedProjectStopsInFlightExecution verifies that deleting a project
// stops the work it already started. Blocking new runs is not enough: an
// engine loop that is already orchestrating keeps queueing tasks and a worker
// holding a lease keeps making outbound calls for a project the owner deleted.
func TestArchivedProjectStopsInFlightExecution(t *testing.T) {
	handler, pool := phase8Handler(t)
	token := registerAndLogin(t, handler, "archive-inflight-"+time.Now().Format("150405.000000000")+"@example.com", "Archive In Flight")
	projectID := createTestProject(t, handler, token)
	// A three second delay opens a window in which the run is genuinely in
	// flight when the project is deleted.
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "slow", Type: "delay", Config: json.RawMessage(`{"seconds":3}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)

	started := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	if started.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d, body = %s", started.Code, started.Body.String())
	}
	var created execution.Execution
	if err := json.NewDecoder(started.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	waitForExecution(t, handler, token, created.ID.String(), "running")

	deleteProjectViaAPI(t, handler, token, projectID)

	waitForExecution(t, handler, token, created.ID.String(), "cancelled")

	// Stopped, not dangling: a cancelled execution must not still have task
	// runs that a worker could pick up later.
	var unfinished int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM task_runs WHERE execution_id = $1 AND status IN ('pending', 'queued', 'running')`, created.ID).Scan(&unfinished); err != nil {
		t.Fatalf("count unfinished task runs: %v", err)
	}
	if unfinished != 0 {
		t.Fatalf("cancelled execution has %d unfinished task runs, want 0", unfinished)
	}
}

// TestArchivedProjectSchedulerDoesNotFire verifies a due schedule belonging to
// a deleted project never produces another execution. Without the guard the
// scheduler would keep firing, failing, and advancing the cadence of a project
// that no longer exists.
func TestArchivedProjectSchedulerDoesNotFire(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()

	userRepo := user.NewPostgresRepository(pool)
	projectRepo := project.NewPostgresRepository(pool)
	workflowRepo := workflow.NewPostgresRepository(pool)
	executionRepo := execution.NewPostgresRepository(pool)
	scheduleRepo := schedule.NewPostgresRepository(pool)
	idempotencyRepo := execution.NewPostgresIdempotencyRepository(pool)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	service := scheduler.NewScheduler(scheduleRepo, executionRepo, idempotencyRepo, workflowRepo, projectRepo, nil, logger)

	testUser := user.User{ID: uuid.New(), Email: fmt.Sprintf("archive-sched-%d@example.com", time.Now().UnixNano()), DisplayName: "Archive Scheduler", PasswordHash: "hashed", CreatedAt: time.Now().UTC()}
	if err := userRepo.Create(ctx, testUser); err != nil {
		t.Fatalf("create user: %v", err)
	}
	testProject := project.Project{ID: uuid.New(), OwnerID: testUser.ID, Name: "Archive Scheduler " + time.Now().Format("150405.000000000"), Status: "active", CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if err := projectRepo.Create(ctx, testProject); err != nil {
		t.Fatalf("create project: %v", err)
	}

	def := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	testWorkflow := workflow.Workflow{ID: uuid.New(), ProjectID: testProject.ID, Name: "Archive Scheduler Workflow", Status: "draft", DraftDefinition: def, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if err := workflowRepo.Create(ctx, testUser.ID, testProject.ID, testWorkflow); err != nil {
		t.Fatalf("create workflow: %v", err)
	}
	version, err := workflowRepo.PublishOwned(ctx, testUser.ID, testWorkflow.ID, def, time.Now().UTC())
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	if err := workflowRepo.ActivateVersionOwned(ctx, testUser.ID, testWorkflow.ID, version.ID, time.Now().UTC()); err != nil {
		t.Fatalf("activate: %v", err)
	}

	due := time.Now().UTC()
	testSchedule := schedule.Schedule{ID: uuid.New(), ProjectID: testProject.ID, WorkflowID: testWorkflow.ID, CronExpression: "* * * * *", Timezone: "UTC", Enabled: true, NextOccurrence: &due, CreatedAt: due, UpdatedAt: due}
	if err := scheduleRepo.Create(ctx, testSchedule); err != nil {
		t.Fatalf("create schedule: %v", err)
	}

	// While the project is active, the due schedule fires exactly once.
	service.Tick(ctx)
	var total int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM executions WHERE project_id = $1`, testProject.ID).Scan(&total); err != nil {
		t.Fatalf("count executions: %v", err)
	}
	if total != 1 {
		t.Fatalf("scheduler created %d executions while the project was active, want 1", total)
	}

	if err := projectRepo.ArchiveOwned(ctx, testUser.ID, testProject.ID, time.Now().UTC()); err != nil {
		t.Fatalf("archive project: %v", err)
	}
	// Make the schedule due again at a DIFFERENT past occurrence. The
	// occurrence timestamp is part of the scheduler's idempotency key, so
	// reusing the original slot would be suppressed by idempotency alone and
	// the test would pass even without the project guard.
	nextDue := due.Add(-time.Minute)
	if err := scheduleRepo.SetNextOccurrence(ctx, testSchedule.ID, &nextDue, time.Now().UTC()); err != nil {
		t.Fatalf("reset next occurrence: %v", err)
	}

	service.Tick(ctx)

	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM executions WHERE project_id = $1`, testProject.ID).Scan(&total); err != nil {
		t.Fatalf("count executions: %v", err)
	}
	if total != 1 {
		t.Fatalf("archived project has %d executions, want 1 (the scheduler must not add more)", total)
	}
}

// TestArchivedProjectWebhookDeliveryIsGone verifies a signed delivery to a
// webhook whose project was deleted is answered with 410 Gone and produces no
// execution. The signature still verifies - the endpoint is permanently
// unavailable, not broken - so the sender is told to stop retrying.
func TestArchivedProjectWebhookDeliveryIsGone(t *testing.T) {
	handler, pool := phase8Handler(t)
	token := registerAndLogin(t, handler, "archive-webhook-"+time.Now().Format("150405.000000000")+"@example.com", "Archive Webhook")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)

	// The webhook path needs an active version: without one the request is
	// rejected as workflow_not_active before the project guard is consulted.
	activate := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/versions/"+versionID+"/activate", nil, token)
	if activate.Code != http.StatusNoContent {
		t.Fatalf("activate version status = %d, body = %s", activate.Code, activate.Body.String())
	}

	secret := "archive-webhook-secret-1234567890"
	created := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/webhooks", map[string]any{"secret": secret}, token)
	if created.Code != http.StatusCreated {
		t.Fatalf("create webhook status = %d, body = %s", created.Code, created.Body.String())
	}
	var webhookBody struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(created.Body).Decode(&webhookBody); err != nil {
		t.Fatal(err)
	}

	deleteProjectViaAPI(t, handler, token, projectID)

	payload := []byte(`{"event":"deleted-project"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/"+webhookBody.ID, bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Webhook-Signature", webhook.SignPayload(secret, payload))
	request.Header.Set("X-Delivery-ID", "delivery-archived-"+uuid.New().String())
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusGone {
		t.Fatalf("webhook delivery to archived project status = %d, want %d (body = %s)", response.Code, http.StatusGone, response.Body.String())
	}

	var executions int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM executions WHERE project_id = $1`, projectID).Scan(&executions); err != nil {
		t.Fatalf("count executions: %v", err)
	}
	if executions != 0 {
		t.Fatalf("webhook created %d executions in an archived project, want 0", executions)
	}
}

// TestArchivedProjectQueuedTaskIsNotClaimable covers the queue side of the same
// guarantee. Stopping live work at delete time leaves a window - an
// orchestrator mid-loop, a delete that crashed before it cancelled, or rows
// written by an older build - in which a queued task row survives for a deleted
// project. Taking work is the last gate before a task actually runs, so a
// worker must refuse it: otherwise the task executes, makes outbound calls and
// sends email for a project the owner deleted.
func TestArchivedProjectQueuedTaskIsNotClaimable(t *testing.T) {
	pool, repository := leaseTestSetup(t)
	executionID, taskRunID := leaseSeedQueuedTask(t, pool, repository, "archived-claim")

	if _, err := pool.Exec(context.Background(),
		`UPDATE projects SET status = 'archived' WHERE id = (SELECT project_id FROM executions WHERE id = $1)`, executionID); err != nil {
		t.Fatalf("archive project: %v", err)
	}

	// The row is deliberately left queued: the guard has to reject it, not
	// depend on the row having disappeared.
	var queued int
	if err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM task_queue WHERE task_run_id = $1 AND status = 'queued'`, taskRunID).Scan(&queued); err != nil {
		t.Fatalf("count queued rows: %v", err)
	}
	if queued != 1 {
		t.Fatalf("queued rows = %d, want 1", queued)
	}

	if _, err := repository.Claim(context.Background(), "worker-archived-project", time.Now().UTC()); !errors.Is(err, queue.ErrNoWork) {
		t.Fatalf("claim for archived project error = %v, want ErrNoWork", err)
	}
}
