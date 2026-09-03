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

// TestPhase7ScheduleTriggersExecution verifies that schedules can trigger executions
func TestPhase7ScheduleTriggersExecution(t *testing.T) {
	databaseURL, ok := os.LookupEnv("INTEGRATION_DATABASE_URL")
	if !ok {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	pool, err := db.Open(ctx, databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()

	// Setup repositories
	userRepo := user.NewPostgresRepository(pool)
	projectRepo := project.NewPostgresRepository(pool)
	workflowRepo := workflow.NewPostgresRepository(pool)
	executionRepo := execution.NewPostgresRepository(pool)
	scheduleRepo := schedule.NewPostgresRepository(pool)
	idempotencyRepo := execution.NewPostgresIdempotencyRepository(pool)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	schedulerService := scheduler.NewScheduler(scheduleRepo, executionRepo, idempotencyRepo, workflowRepo, projectRepo, nil, logger)

	// Create user
	testUser := user.User{
		ID:           uuid.New(),
		Email:        fmt.Sprintf("phase7test%d@example.com", time.Now().UnixNano()),
		DisplayName:  "Phase7 Test User",
		PasswordHash: "hashed",
		CreatedAt:    time.Now().UTC(),
	}
	if err := userRepo.Create(ctx, testUser); err != nil {
		t.Fatalf("create user: %v", err)
	}

	// Create project
	testProject := project.Project{
		ID:        uuid.New(),
		OwnerID:   testUser.ID,
		Name:      "Phase7 Test",
		CreatedAt: time.Now().UTC(),
	}
	if err := projectRepo.Create(ctx, testProject); err != nil {
		t.Fatalf("create project: %v", err)
	}

	// Create workflow
	def := workflow.Definition{
		Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{"message":"hello"}}`)}},
	}
	testWorkflow := workflow.Workflow{
		ID:              uuid.New(),
		ProjectID:       testProject.ID,
		Name:            "Phase7 Workflow",
		Description:     "",
		Status:          "draft",
		DraftDefinition: def,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
	if err := workflowRepo.Create(ctx, testUser.ID, testProject.ID, testWorkflow); err != nil {
		t.Fatalf("create workflow: %v", err)
	}

	// Publish workflow
	version, err := workflowRepo.PublishOwned(ctx, testUser.ID, testWorkflow.ID, def, time.Now().UTC())
	if err != nil {
		t.Fatalf("publish version: %v", err)
	}

	// Activate version
	if err := workflowRepo.ActivateVersionOwned(ctx, testUser.ID, testWorkflow.ID, version.ID, time.Now().UTC()); err != nil {
		t.Fatalf("activate version: %v", err)
	}

	// Create schedule
	testSchedule := schedule.Schedule{
		ID:             uuid.New(),
		ProjectID:      testProject.ID,
		WorkflowID:     testWorkflow.ID,
		CronExpression: "* * * * *", // Every minute
		Timezone:       "UTC",
		Enabled:        true,
		NextOccurrence: timePtr(time.Now().UTC()),
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	}

	if err := scheduleRepo.Create(ctx, testSchedule); err != nil {
		t.Fatalf("create schedule: %v", err)
	}

	// Run scheduler tick
	schedulerService.Tick(ctx)

	// Verify execution was created
	executions, err := executionRepo.ListOwned(ctx, testUser.ID, testProject.ID)
	if err != nil {
		t.Fatalf("list executions: %v", err)
	}

	if len(executions) == 0 {
		t.Fatal("expected execution to be created by scheduler")
	}

	// Verify idempotency (running scheduler again should not create duplicate)
	initialCount := len(executions)
	schedulerService.Tick(ctx)

	executions, err = executionRepo.ListOwned(ctx, testUser.ID, testProject.ID)
	if err != nil {
		t.Fatalf("list executions: %v", err)
	}

	if len(executions) > initialCount {
		t.Fatal("scheduler created duplicate execution (idempotency failed)")
	}
}

// TestPhase7WebhookTriggersExecution verifies that webhooks can trigger executions
func TestPhase7WebhookTriggersExecution(t *testing.T) {
	databaseURL, ok := os.LookupEnv("INTEGRATION_DATABASE_URL")
	if !ok {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	pool, err := db.Open(ctx, databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()

	// Setup repositories
	userRepo := user.NewPostgresRepository(pool)
	projectRepo := project.NewPostgresRepository(pool)
	workflowRepo := workflow.NewPostgresRepository(pool)
	executionRepo := execution.NewPostgresRepository(pool)
	webhookRepo := webhook.NewPostgresRepository(pool)
	idempotencyRepo := execution.NewPostgresIdempotencyRepository(pool)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	engine := execution.NewEngine(executionRepo, execution.NewBuiltinRuntime(nil))

	handler := NewExecutionServer(
		pool, userRepo, projectRepo, workflowRepo, executionRepo, engine,
		auth.NewTokenService("01234567890123456789012345678901"),
		nil, webhookRepo, idempotencyRepo, logger,
	).Router()

	// Create user
	testUser := user.User{
		ID:           uuid.New(),
		Email:        fmt.Sprintf("phase7webhook%d@example.com", time.Now().UnixNano()),
		DisplayName:  "Phase7 Webhook User",
		PasswordHash: "hashed",
		CreatedAt:    time.Now().UTC(),
	}
	if err := userRepo.Create(ctx, testUser); err != nil {
		t.Fatalf("create user: %v", err)
	}

	// Create project
	testProject := project.Project{
		ID:        uuid.New(),
		OwnerID:   testUser.ID,
		Name:      "Phase7 Webhook Test",
		CreatedAt: time.Now().UTC(),
	}
	if err := projectRepo.Create(ctx, testProject); err != nil {
		t.Fatalf("create project: %v", err)
	}

	// Create workflow
	def := workflow.Definition{
		Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{"message":"webhook"}}`)}},
	}
	testWorkflow := workflow.Workflow{
		ID:              uuid.New(),
		ProjectID:       testProject.ID,
		Name:            "Phase7 Webhook Workflow",
		Description:     "",
		Status:          "draft",
		DraftDefinition: def,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
	if err := workflowRepo.Create(ctx, testUser.ID, testProject.ID, testWorkflow); err != nil {
		t.Fatalf("create workflow: %v", err)
	}

	// Publish workflow
	version, err := workflowRepo.PublishOwned(ctx, testUser.ID, testWorkflow.ID, def, time.Now().UTC())
	if err != nil {
		t.Fatalf("publish version: %v", err)
	}

	// Activate version
	if err := workflowRepo.ActivateVersionOwned(ctx, testUser.ID, testWorkflow.ID, version.ID, time.Now().UTC()); err != nil {
		t.Fatalf("activate version: %v", err)
	}

	// Create webhook
	secret := "test-webhook-secret-1234567890ab"
	webhookID := fmt.Sprintf("wh_%s", uuid.New().String()[:12])
	wh := webhook.Webhook{
		ID:         webhookID,
		ProjectID:  testProject.ID,
		WorkflowID: testWorkflow.ID,
		Enabled:    true,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
	}
	if err := webhookRepo.Create(ctx, wh, secret); err != nil {
		t.Fatalf("create webhook: %v", err)
	}

	// Trigger webhook
	payload := []byte(`{"test": "data"}`)
	signature := webhook.SignPayload(secret, payload)
	webhookURL := fmt.Sprintf("/api/v1/webhooks/%s", webhookID)

	req := httptest.NewRequest(http.MethodPost, webhookURL, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", signature)
	req.Header.Set("X-Delivery-ID", "delivery-123")

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("webhook trigger status = %d, expected %d. Body: %s", w.Code, http.StatusAccepted, w.Body.String())
	}

	// Verify execution was created
	executions, err := executionRepo.ListOwned(ctx, testUser.ID, testProject.ID)
	if err != nil {
		t.Fatalf("list executions: %v", err)
	}

	if len(executions) == 0 {
		t.Fatal("expected execution to be created by webhook")
	}
}

// TestPhase7IdempotencyPreventsDuplicateExecutions verifies idempotency key behavior
func TestPhase7IdempotencyPreventsDuplicateExecutions(t *testing.T) {
	databaseURL, ok := os.LookupEnv("INTEGRATION_DATABASE_URL")
	if !ok {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	pool, err := db.Open(ctx, databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()

	userRepo := user.NewPostgresRepository(pool)
	projectRepo := project.NewPostgresRepository(pool)
	workflowRepo := workflow.NewPostgresRepository(pool)
	executionRepo := execution.NewPostgresRepository(pool)
	idempotencyRepo := execution.NewPostgresIdempotencyRepository(pool)

	// Set up a real project and workflow so executions satisfy the FK.
	testUser := user.User{
		ID:           uuid.New(),
		Email:        fmt.Sprintf("phase7idem%d@example.com", time.Now().UnixNano()),
		DisplayName:  "Phase7 Idempotency User",
		PasswordHash: "hashed",
		CreatedAt:    time.Now().UTC(),
	}
	if err := userRepo.Create(ctx, testUser); err != nil {
		t.Fatalf("create user: %v", err)
	}

	testProject := project.Project{
		ID:        uuid.New(),
		OwnerID:   testUser.ID,
		Name:      "Phase7 Idempotency Project",
		CreatedAt: time.Now().UTC(),
	}
	if err := projectRepo.Create(ctx, testProject); err != nil {
		t.Fatalf("create project: %v", err)
	}

	def := workflow.Definition{
		Tasks: []workflow.Task{{ID: "task1", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}},
	}
	testWorkflow := workflow.Workflow{
		ID:              uuid.New(),
		ProjectID:       testProject.ID,
		Name:            "Phase7 Idempotency Workflow",
		Status:          "draft",
		DraftDefinition: def,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
	if err := workflowRepo.Create(ctx, testUser.ID, testProject.ID, testWorkflow); err != nil {
		t.Fatalf("create workflow: %v", err)
	}
	version, err := workflowRepo.PublishOwned(ctx, testUser.ID, testWorkflow.ID, def, time.Now().UTC())
	if err != nil {
		t.Fatalf("publish version: %v", err)
	}
	if err := workflowRepo.ActivateVersionOwned(ctx, testUser.ID, testWorkflow.ID, version.ID, time.Now().UTC()); err != nil {
		t.Fatalf("activate version: %v", err)
	}

	// Create the two real executions referenced by idempotency keys.
	execution1, err := executionRepo.CreateOwned(ctx, testUser.ID, testWorkflow.ID, version.ID, json.RawMessage(`{}`), time.Now().UTC())
	if err != nil {
		t.Fatalf("create first execution: %v", err)
	}
	execution2, err := executionRepo.CreateOwned(ctx, testUser.ID, testWorkflow.ID, version.ID, json.RawMessage(`{}`), time.Now().UTC())
	if err != nil {
		t.Fatalf("create second execution: %v", err)
	}

	key := "test-idempotency-key"
	now := time.Now().UTC()

	// Record first execution
	if err := idempotencyRepo.RecordIdempotencyKey(ctx, testProject.ID, execution1.ID, key, now); err != nil {
		t.Fatalf("record first execution: %v", err)
	}

	// Try to record different execution with same key
	err = idempotencyRepo.RecordIdempotencyKey(ctx, testProject.ID, execution2.ID, key, now)
	if err != execution.ErrIdempotencyKeyExists {
		t.Fatalf("expected ErrIdempotencyKeyExists, got %v", err)
	}

	// Verify first execution is stored
	retrieved, err := idempotencyRepo.GetExecutionByIdempotencyKey(ctx, testProject.ID, key)
	if err != nil {
		t.Fatalf("retrieve execution: %v", err)
	}
	if retrieved != execution1.ID {
		t.Fatalf("expected execution ID %s, got %s", execution1.ID, retrieved)
	}

	// Recording same execution again should not error
	if err := idempotencyRepo.RecordIdempotencyKey(ctx, testProject.ID, execution1.ID, key, now); err != nil {
		t.Fatalf("re-record same execution: %v", err)
	}
}

// Helper types
type responseWriter struct {
	status int
	header http.Header
	body   *bytes.Buffer
}

func (w *responseWriter) Header() http.Header         { return w.header }
func (w *responseWriter) Write(b []byte) (int, error) { return w.body.Write(b) }
func (w *responseWriter) WriteHeader(status int)      { w.status = status }

// Helper functions
func timePtr(t time.Time) *time.Time { return &t }
