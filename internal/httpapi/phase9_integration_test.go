package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/artifact"
	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/worker"
	"github.com/neyati/flowforge/internal/workflow"
)

func phase9Handler(t *testing.T) (http.Handler, *pgxpool.Pool, *queue.PostgresRepository) {
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

	executionRepository := execution.NewPostgresRepository(pool)
	taskQueue := queue.NewPostgresRepository(pool)
	runtime := execution.NewBuiltinRuntime(nil)
	engine := execution.NewEngine(executionRepository, runtime, taskQueue)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	handler := NewExecutionServer(
		pool,
		user.NewPostgresRepository(pool),
		project.NewPostgresRepository(pool),
		workflow.NewPostgresRepository(pool),
		executionRepository,
		engine,
		auth.NewTokenService("01234567890123456789012345678901"),
		nil, // schedules
		nil, // webhooks
		nil, // idempotency
		logger,
	).Router()
	return handler, pool, taskQueue
}

func runPhase9Worker(t *testing.T, taskQueue *queue.PostgresRepository, ctx context.Context, group *sync.WaitGroup) {
	t.Helper()
	workerOne := &worker.Worker{ID: "phase9-worker", Queue: taskQueue, Runtime: execution.NewBuiltinRuntime(nil)}
	group.Add(1)
	go func() {
		defer group.Done()
		_ = workerOne.Run(ctx)
	}()
}

// TestPhase9V1DemoWorkflow runs a demonstration workflow through the full
// queued path: an HTTP fetch, a conditional on the trigger input, a transform,
// and an email send, without any task-specific logic in the orchestrator.
func TestPhase9V1DemoWorkflow(t *testing.T) {
	handler, _, taskQueue := phase9Handler(t)
	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer httpServer.Close()

	token := registerAndLogin(t, handler, "phase9-demo-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 9 Demo")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{
		{ID: "fetch", Type: "http", Config: json.RawMessage(`{"method":"GET","url":"` + httpServer.URL + `"}`)},
		{ID: "check", Type: "conditional", Config: json.RawMessage(`{"field":"status","equals":"ok"}`), Dependencies: []string{"fetch"}},
		{ID: "transform", Type: "transform", Config: json.RawMessage(`{"output":{"message":"hello"}}`), Dependencies: []string{"check"}},
		{ID: "notify", Type: "email", Config: json.RawMessage(`{"to":"demo@example.com","subject":"Done","body":"done"}`), Dependencies: []string{"transform"}},
	}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)

	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]string{"status": "ok"}}, token)
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d, body = %s", response.Code, response.Body.String())
	}
	var created execution.Execution
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	var group sync.WaitGroup
	runPhase9Worker(t, taskQueue, ctx, &group)
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancel()
	group.Wait()

	tasks := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+created.ID.String()+"/tasks", nil, token)
	if tasks.Code != http.StatusOK {
		t.Fatalf("task listing status = %d", tasks.Code)
	}
	var runs []execution.TaskRun
	if err := json.NewDecoder(tasks.Body).Decode(&runs); err != nil {
		t.Fatal(err)
	}
	if len(runs) != 4 {
		t.Fatalf("task runs = %d, want 4", len(runs))
	}
	for _, run := range runs {
		if run.Status != "succeeded" {
			t.Fatalf("task %s status = %s", run.TaskID, run.Status)
		}
	}
}

// TestPhase9LargeArtifactReferenceFlow verifies that an execution input and a
// task output can carry an object-storage artifact reference rather than a
// large inline payload, and that the reference flows through to completion.
func TestPhase9LargeArtifactReferenceFlow(t *testing.T) {
	handler, _, taskQueue := phase9Handler(t)
	token := registerAndLogin(t, handler, "phase9-artifact-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 9 Artifact")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{
		{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{"artifact":{"type":"object_storage","uri":"s3://bucket/out","size":12345678,"content_type":"application/octet-stream"}}}`)},
	}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)

	input := map[string]any{
		"artifact": map[string]any{
			"type":         "object_storage",
			"uri":          "s3://bucket/in",
			"size":         987654,
			"content_type": "application/octet-stream",
		},
	}
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": input}, token)
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d, body = %s", response.Code, response.Body.String())
	}
	var created execution.Execution
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	var group sync.WaitGroup
	runPhase9Worker(t, taskQueue, ctx, &group)
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancel()
	group.Wait()
}

// TestPhase9InputSizeLimitRejected verifies that an execution input larger
// than the safe limit is rejected with a 422 rather than being persisted.
func TestPhase9InputSizeLimitRejected(t *testing.T) {
	handler, _, _ := phase9Handler(t)
	token := registerAndLogin(t, handler, "phase9-limit-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 9 Limit")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{
		{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{}}`)},
	}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)

	big := strings.Repeat("x", artifact.MaxInputBytes+1)
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]string{"data": big}}, token)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("oversized input status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
}
