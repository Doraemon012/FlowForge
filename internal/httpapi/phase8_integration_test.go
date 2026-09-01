package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/schedule"
	"github.com/neyati/flowforge/internal/scheduler"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/webhook"
	"github.com/neyati/flowforge/internal/workflow"
)

// phase8Handler builds a full server with schedules, webhooks and idempotency
// wired in, mirroring the real deployment wiring.
func phase8Handler(t *testing.T) (http.Handler, *pgxpool.Pool) {
	t.Helper()
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	pool, err := db.Open(context.Background(), databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { pool.Close() })

	userRepo := user.NewPostgresRepository(pool)
	projectRepo := project.NewPostgresRepository(pool)
	workflowRepo := workflow.NewPostgresRepository(pool)
	executionRepo := execution.NewPostgresRepository(pool)
	scheduleRepo := schedule.NewPostgresRepository(pool)
	webhookRepo := webhook.NewPostgresRepository(pool)
	idempotencyRepo := execution.NewPostgresIdempotencyRepository(pool)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	engine := execution.NewEngine(executionRepo, execution.NewBuiltinRuntime(nil))

	return NewExecutionServer(
		pool, userRepo, projectRepo, workflowRepo, executionRepo, engine,
		auth.NewTokenService("01234567890123456789012345678901"),
		scheduleRepo, webhookRepo, idempotencyRepo, logger,
	).Router(), pool
}

// TestPhase8WebhookRejectsStaleTimestamp verifies the replay-protection guard:
// a delivery carrying an X-Webhook-Timestamp older than the tolerance window
// is rejected even when the signature is valid.
func TestPhase8WebhookRejectsStaleTimestamp(t *testing.T) {
	handler, pool := phase8Handler(t)
	token := registerAndLogin(t, handler, "phase8-stale-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 8 Stale")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, _ := createAndPublishWorkflow(t, handler, token, projectID, definition)

	secret := "phase8-secret-1234567890ab"
	webhookID := fmt.Sprintf("wh_%s", uuid.New().String()[:12])
	wh := webhook.Webhook{
		ID:         webhookID,
		ProjectID:  uuid.MustParse(projectID),
		WorkflowID: uuid.MustParse(workflowID),
		Enabled:    true,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
	}
	if err := webhook.NewPostgresRepository(pool).Create(context.Background(), wh, secret); err != nil {
		t.Fatalf("create webhook: %v", err)
	}

	payload := []byte(`{"test":"replay"}`)
	signature := webhook.SignPayload(secret, payload)
	staleTimestamp := time.Now().Add(-10 * time.Minute).Unix()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/"+webhookID, bytes.NewReader(payload))
	req.Header.Set("X-Webhook-Signature", signature)
	req.Header.Set("X-Webhook-Timestamp", fmt.Sprintf("%d", staleTimestamp))
	req.Header.Set("X-Delivery-ID", "delivery-stale-"+uuid.New().String())

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("stale webhook status = %d, expected %d. Body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

// TestPhase8WebhookRejectsFutureTimestamp verifies a timestamp from the future
// is also rejected.
func TestPhase8WebhookRejectsFutureTimestamp(t *testing.T) {
	handler, pool := phase8Handler(t)
	token := registerAndLogin(t, handler, "phase8-future-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 8 Future")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, _ := createAndPublishWorkflow(t, handler, token, projectID, definition)

	secret := "phase8-secret-future-1234567890ab"
	webhookID := fmt.Sprintf("wh_%s", uuid.New().String()[:12])
	wh := webhook.Webhook{
		ID:         webhookID,
		ProjectID:  uuid.MustParse(projectID),
		WorkflowID: uuid.MustParse(workflowID),
		Enabled:    true,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
	}
	if err := webhook.NewPostgresRepository(pool).Create(context.Background(), wh, secret); err != nil {
		t.Fatalf("create webhook: %v", err)
	}

	payload := []byte(`{"test":"future"}`)
	signature := webhook.SignPayload(secret, payload)
	futureTimestamp := time.Now().Add(10 * time.Minute).Unix()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/"+webhookID, bytes.NewReader(payload))
	req.Header.Set("X-Webhook-Signature", signature)
	req.Header.Set("X-Webhook-Timestamp", fmt.Sprintf("%d", futureTimestamp))
	req.Header.Set("X-Delivery-ID", "delivery-future-"+uuid.New().String())

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("future webhook status = %d, expected %d. Body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

// TestPhase8ExecutionIdempotencyKey verifies that a manual/API trigger with an
// Idempotency-Key header returns the original execution on retry instead of
// creating a duplicate.
func TestPhase8ExecutionIdempotencyKey(t *testing.T) {
	handler, _ := phase8Handler(t)
	token := registerAndLogin(t, handler, "phase8-idem-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 8 Idem")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	path := "/api/v1/projects/" + projectID + "/workflows/" + workflowID + "/executions"
	idempotencyKey := "manual-key-" + uuid.New().String()

	first := requestJSONWithHeader(handler, http.MethodPost, path, map[string]any{"version_id": versionID, "input": map[string]any{}}, token, "Idempotency-Key", idempotencyKey)
	if first.Code != http.StatusAccepted {
		t.Fatalf("first execution status = %d, body = %s", first.Code, first.Body.String())
	}
	var firstExecution execution.Execution
	if err := json.NewDecoder(first.Body).Decode(&firstExecution); err != nil {
		t.Fatalf("decode first execution: %v", err)
	}

	second := requestJSONWithHeader(handler, http.MethodPost, path, map[string]any{"version_id": versionID, "input": map[string]any{}}, token, "Idempotency-Key", idempotencyKey)
	if second.Code != http.StatusOK {
		t.Fatalf("retry execution status = %d, expected %d. Body: %s", second.Code, http.StatusOK, second.Body.String())
	}
	var secondExecution execution.Execution
	if err := json.NewDecoder(second.Body).Decode(&secondExecution); err != nil {
		t.Fatalf("decode second execution: %v", err)
	}
	if secondExecution.ID != firstExecution.ID {
		t.Fatalf("idempotency retry returned different execution: %s vs %s", secondExecution.ID, firstExecution.ID)
	}
}

// TestPhase8ScheduleComputesNextOccurrence verifies that creating a schedule
// via the API computes a future next_occurrence from the cron expression.
func TestPhase8ScheduleComputesNextOccurrence(t *testing.T) {
	handler, _ := phase8Handler(t)
	token := registerAndLogin(t, handler, "phase8-sched-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 8 Schedule")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, _ := createAndPublishWorkflow(t, handler, token, projectID, definition)

	path := "/api/v1/projects/" + projectID + "/workflows/" + workflowID + "/schedules"
	create := requestJSON(handler, http.MethodPost, path, map[string]any{"cron_expression": "* * * * *", "timezone": "UTC"}, token)
	if create.Code != http.StatusCreated {
		t.Fatalf("create schedule status = %d, body = %s", create.Code, create.Body.String())
	}
	var created schedule.Schedule
	if err := json.NewDecoder(create.Body).Decode(&created); err != nil {
		t.Fatalf("decode schedule: %v", err)
	}
	if created.NextOccurrence == nil {
		t.Fatal("schedule next_occurrence is nil after create")
	}
	if !created.NextOccurrence.After(time.Now().UTC().Add(-time.Second)) {
		t.Fatalf("schedule next_occurrence %v is not in the future", created.NextOccurrence)
	}

	get := requestJSON(handler, http.MethodGet, path, nil, token)
	if get.Code != http.StatusOK {
		t.Fatalf("get schedule status = %d", get.Code)
	}
	var fetched schedule.Schedule
	if err := json.NewDecoder(get.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode fetched schedule: %v", err)
	}
	if fetched.NextOccurrence == nil {
		t.Fatal("persisted schedule next_occurrence is nil")
	}
}

// TestPhase8SchedulerSkipsInactiveWorkflow verifies a schedule does not
// create an execution when its workflow has no active version.
func TestPhase8SchedulerSkipsInactiveWorkflow(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	pool, err := db.Open(context.Background(), databaseURL, 5*time.Second)
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

	schedSvc := scheduler.NewScheduler(scheduleRepo, executionRepo, idempotencyRepo, workflowRepo, projectRepo, logger)

	testUser := user.User{ID: uuid.New(), Email: fmt.Sprintf("phase8-inactive-%d@example.com", time.Now().UnixNano()), DisplayName: "Phase8 Inactive", PasswordHash: "hashed", CreatedAt: time.Now().UTC()}
	if err := userRepo.Create(context.Background(), testUser); err != nil {
		t.Fatalf("create user: %v", err)
	}
	testProject := project.Project{ID: uuid.New(), OwnerID: testUser.ID, Name: "Phase8 Inactive", CreatedAt: time.Now().UTC()}
	if err := projectRepo.Create(context.Background(), testProject); err != nil {
		t.Fatalf("create project: %v", err)
	}

	def := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	testWorkflow := workflow.Workflow{ID: uuid.New(), ProjectID: testProject.ID, Name: "Phase8 Inactive Workflow", Status: "draft", DraftDefinition: def, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if err := workflowRepo.Create(context.Background(), testUser.ID, testProject.ID, testWorkflow); err != nil {
		t.Fatalf("create workflow: %v", err)
	}
	// Publish but do NOT activate -> no active version.
	if _, err := workflowRepo.PublishOwned(context.Background(), testUser.ID, testWorkflow.ID, def, time.Now().UTC()); err != nil {
		t.Fatalf("publish: %v", err)
	}

	now := time.Now().UTC()
	testSchedule := schedule.Schedule{ID: uuid.New(), ProjectID: testProject.ID, WorkflowID: testWorkflow.ID, CronExpression: "* * * * *", Timezone: "UTC", Enabled: true, NextOccurrence: &now, CreatedAt: now, UpdatedAt: now}
	if err := scheduleRepo.Create(context.Background(), testSchedule); err != nil {
		t.Fatalf("create schedule: %v", err)
	}

	schedSvc.Tick(context.Background())

	executions, err := executionRepo.ListOwned(context.Background(), testUser.ID, testProject.ID)
	if err != nil {
		t.Fatalf("list executions: %v", err)
	}
	if len(executions) != 0 {
		t.Fatalf("scheduler created %d executions for inactive workflow, want 0", len(executions))
	}
}

// TestPhase8ScheduleAdvancesNextOccurrence verifies that after a scheduler
// fires a due schedule, next_occurrence advances to the next future slot so
// the same occurrence is not re-fired.
func TestPhase8ScheduleAdvancesNextOccurrence(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	pool, err := db.Open(context.Background(), databaseURL, 5*time.Second)
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

	schedSvc := scheduler.NewScheduler(scheduleRepo, executionRepo, idempotencyRepo, workflowRepo, projectRepo, logger)

	testUser := user.User{ID: uuid.New(), Email: fmt.Sprintf("phase8-advance-%d@example.com", time.Now().UnixNano()), DisplayName: "Phase8 Advance", PasswordHash: "hashed", CreatedAt: time.Now().UTC()}
	if err := userRepo.Create(context.Background(), testUser); err != nil {
		t.Fatalf("create user: %v", err)
	}
	testProject := project.Project{ID: uuid.New(), OwnerID: testUser.ID, Name: "Phase8 Advance", CreatedAt: time.Now().UTC()}
	if err := projectRepo.Create(context.Background(), testProject); err != nil {
		t.Fatalf("create project: %v", err)
	}

	def := workflow.Definition{Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	testWorkflow := workflow.Workflow{ID: uuid.New(), ProjectID: testProject.ID, Name: "Phase8 Advance Workflow", Status: "draft", DraftDefinition: def, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if err := workflowRepo.Create(context.Background(), testUser.ID, testProject.ID, testWorkflow); err != nil {
		t.Fatalf("create workflow: %v", err)
	}
	version, err := workflowRepo.PublishOwned(context.Background(), testUser.ID, testWorkflow.ID, def, time.Now().UTC())
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	if err := workflowRepo.ActivateVersionOwned(context.Background(), testUser.ID, testWorkflow.ID, version.ID, time.Now().UTC()); err != nil {
		t.Fatalf("activate: %v", err)
	}

	now := time.Now().UTC()
	testSchedule := schedule.Schedule{ID: uuid.New(), ProjectID: testProject.ID, WorkflowID: testWorkflow.ID, CronExpression: "* * * * *", Timezone: "UTC", Enabled: true, NextOccurrence: &now, CreatedAt: now, UpdatedAt: now}
	if err := scheduleRepo.Create(context.Background(), testSchedule); err != nil {
		t.Fatalf("create schedule: %v", err)
	}

	schedSvc.Tick(context.Background())

	executions, err := executionRepo.ListOwned(context.Background(), testUser.ID, testProject.ID)
	if err != nil {
		t.Fatalf("list executions: %v", err)
	}
	if len(executions) != 1 {
		t.Fatalf("scheduler created %d executions for due schedule, want 1", len(executions))
	}

	// Verify the schedule's next_occurrence advanced past the original now.
	fetched, err := scheduleRepo.GetByWorkflow(context.Background(), testProject.ID, testWorkflow.ID)
	if err != nil {
		t.Fatalf("get schedule: %v", err)
	}
	if fetched.NextOccurrence == nil || !fetched.NextOccurrence.After(now) {
		t.Fatalf("next_occurrence did not advance: %v (after %v)", fetched.NextOccurrence, now)
	}
}

// requestJSONWithHeader issues a request with an extra header, mirroring
// requestJSON but allowing a custom idempotency/delivery header.
func requestJSONWithHeader(handler http.Handler, method, path string, body any, token, header, value string) *httptest.ResponseRecorder {
	var payload bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&payload).Encode(body)
	}
	request := httptest.NewRequest(method, path, &payload)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	request.Header.Set(header, value)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
