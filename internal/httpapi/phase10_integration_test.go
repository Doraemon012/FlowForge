package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/observ"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/worker"
	"github.com/neyati/flowforge/internal/workflow"
)

// phase10Handler builds a full server with the observability repository wired
// in, mirroring the real deployment wiring so events, logs, attempts, workers,
// queue and metrics endpoints are all mounted.
func phase10Handler(t *testing.T) (http.Handler, *pgxpool.Pool, *queue.PostgresRepository, *observ.PostgresRepository) {
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
	observRepository := observ.NewPostgresRepository(pool)
	idempotencyRepository := execution.NewPostgresIdempotencyRepository(pool)
	runtime := execution.NewBuiltinRuntime(nil)
	engine := execution.NewEngine(executionRepository, runtime, taskQueue)
	engine.SetRecorder(observRepository)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))

	server := NewExecutionServer(
		pool,
		user.NewPostgresRepository(pool),
		project.NewPostgresRepository(pool),
		workflow.NewPostgresRepository(pool),
		executionRepository,
		engine,
		auth.NewTokenService("01234567890123456789012345678901"),
		nil, // schedules
		nil, // webhooks
		idempotencyRepository,
		logger,
	)
	server.SetObservatory(observRepository)

	return server.Router(), pool, taskQueue, observRepository
}

func runPhase10Worker(t *testing.T, taskQueue *queue.PostgresRepository, observRepository *observ.PostgresRepository, ctx context.Context, group *sync.WaitGroup) {
	t.Helper()
	workerOne := &worker.Worker{
		ID:       "phase10-worker",
		Queue:    taskQueue,
		Runtime:  execution.NewBuiltinRuntime(nil),
		Recorder: observRepository,
		Logs:     observRepository,
	}
	group.Add(1)
	go func() {
		defer group.Done()
		_ = workerOne.Run(ctx)
	}()
}

// TestPhase10ObservabilityEndpoints runs a workflow through the queued path
// with an observability-wired worker, then verifies that events, logs,
// attempts, worker views, queue metrics and aggregate metrics all expose the
// expected correlation data.
func TestPhase10ObservabilityEndpoints(t *testing.T) {
	handler, _, taskQueue, observRepository := phase10Handler(t)
	token := registerAndLogin(t, handler, "phase10-observ-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 10 Observability")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{
		{ID: "first", Type: "transform", Config: json.RawMessage(`{"output":{"step":"first"}}`)},
		{ID: "second", Type: "transform", Config: json.RawMessage(`{"output":{"step":"second"}}`), Dependencies: []string{"first"}},
	}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)

	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d, body = %s", response.Code, response.Body.String())
	}
	var created execution.Execution
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	var group sync.WaitGroup
	runPhase10Worker(t, taskQueue, observRepository, ctx, &group)
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancel()
	group.Wait()

	// Events must include the domain lifecycle events emitted by the engine.
	events := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+created.ID.String()+"/events", nil, token)
	if events.Code != http.StatusOK {
		t.Fatalf("events status = %d, body = %s", events.Code, events.Body.String())
	}
	var eventList []observ.Event
	if err := json.NewDecoder(events.Body).Decode(&eventList); err != nil {
		t.Fatal(err)
	}
	if len(eventList) == 0 {
		t.Fatal("execution event history is empty")
	}
	haveStarted := false
	for _, event := range eventList {
		if event.EventType == "execution_started" {
			haveStarted = true
		}
	}
	if !haveStarted {
		t.Fatal("execution_started event missing from event history")
	}

	// Worker lifecycle events must have been persisted by the observability
	// worker (task_claimed, task_succeeded).
	haveClaim := false
	for _, event := range eventList {
		if event.EventType == "task_claimed" {
			haveClaim = true
		}
	}
	if !haveClaim {
		t.Fatalf("task_claimed event missing from event history: %+v", eventList)
	}

	// Worker logs must be persisted and queryable.
	logs := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+created.ID.String()+"/logs", nil, token)
	if logs.Code != http.StatusOK {
		t.Fatalf("logs status = %d, body = %s", logs.Code, logs.Body.String())
	}
	var logList []observ.LogEntry
	if err := json.NewDecoder(logs.Body).Decode(&logList); err != nil {
		t.Fatal(err)
	}
	if len(logList) == 0 {
		t.Fatal("execution log history is empty")
	}

	// Attempt history must show the worker assignment.
	attempts := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+created.ID.String()+"/attempts", nil, token)
	if attempts.Code != http.StatusOK {
		t.Fatalf("attempts status = %d, body = %s", attempts.Code, attempts.Body.String())
	}
	var attemptList []observ.TaskAttempt
	if err := json.NewDecoder(attempts.Body).Decode(&attemptList); err != nil {
		t.Fatal(err)
	}
	if len(attemptList) == 0 {
		t.Fatal("attempt history is empty")
	}

	// Workers view should list the active/used worker (it may be idle now).
	workers := requestJSON(handler, http.MethodGet, "/api/v1/workers", nil, token)
	if workers.Code != http.StatusOK {
		t.Fatalf("workers status = %d, body = %s", workers.Code, workers.Body.String())
	}

	// Queue view should expose the queue health summary.
	queueView := requestJSON(handler, http.MethodGet, "/api/v1/queue", nil, token)
	if queueView.Code != http.StatusOK {
		t.Fatalf("queue view status = %d, body = %s", queueView.Code, queueView.Body.String())
	}
	var queueMetrics observ.QueueView
	if err := json.NewDecoder(queueView.Body).Decode(&queueMetrics); err != nil {
		t.Fatal(err)
	}
	if queueMetrics.Completed < 2 {
		t.Fatalf("queue completed count = %d, want at least 2", queueMetrics.Completed)
	}

	// Aggregate metrics endpoint should return the full operational summary.
	metrics := requestJSON(handler, http.MethodGet, "/api/v1/metrics", nil, token)
	if metrics.Code != http.StatusOK {
		t.Fatalf("metrics status = %d, body = %s", metrics.Code, metrics.Body.String())
	}
	var summary observ.Metrics
	if err := json.NewDecoder(metrics.Body).Decode(&summary); err != nil {
		t.Fatal(err)
	}
	if summary.Executions.Completed < 1 {
		t.Fatalf("metrics completed executions = %d, want >= 1", summary.Executions.Completed)
	}
	if summary.Attempts.Succeeded < 2 {
		t.Fatalf("metrics succeeded attempts = %d, want >= 2", summary.Attempts.Succeeded)
	}
}

// TestPhase10ObservabilityProjectIsolation verifies that a non-owner cannot
// read an execution's events, logs, or attempts.
func TestPhase10ObservabilityProjectIsolation(t *testing.T) {
	handler, _, _, _ := phase10Handler(t)
	token := registerAndLogin(t, handler, "phase10-owner-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 10 Owner")
	otherToken := registerAndLogin(t, handler, "phase10-other-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 10 Other")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d", response.Code)
	}
	var created execution.Execution
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{
		"/api/v1/executions/" + created.ID.String() + "/events",
		"/api/v1/executions/" + created.ID.String() + "/logs",
		"/api/v1/executions/" + created.ID.String() + "/attempts",
	} {
		if response := requestJSON(handler, http.MethodGet, path, nil, otherToken); response.Code != http.StatusNotFound {
			t.Fatalf("non-owner %s status = %d, want %d", path, response.Code, http.StatusNotFound)
		}
	}
}

// TestPhase10ConcurrentIdempotencyCreatesOneExecution verifies that concurrent
// requests sharing an Idempotency-Key produce exactly one execution, closing
// the check-then-act race.
func TestPhase10ConcurrentIdempotencyCreatesOneExecution(t *testing.T) {
	handler, _, _, _ := phase10Handler(t)
	token := registerAndLogin(t, handler, "phase10-idem-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 10 Idempotency")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	path := "/api/v1/projects/" + projectID + "/workflows/" + workflowID + "/executions"
	idempotencyKey := "phase10-concurrent-" + time.Now().Format("150405.000000000")

	const contenders = 8
	var group sync.WaitGroup
	results := make([]*httptest.ResponseRecorder, contenders)
	for index := 0; index < contenders; index++ {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			results[i] = requestJSONWithHeader(handler, http.MethodPost, path, map[string]any{"version_id": versionID, "input": map[string]any{}}, token, "Idempotency-Key", idempotencyKey)
		}(index)
	}
	group.Wait()

	unique := make(map[string]struct{})
	for _, result := range results {
		if result.Code != http.StatusOK && result.Code != http.StatusAccepted {
			t.Fatalf("idempotency request status = %d, body = %s", result.Code, result.Body.String())
		}
		var exec execution.Execution
		if err := json.NewDecoder(result.Body).Decode(&exec); err != nil {
			t.Fatal(err)
		}
		unique[exec.ID.String()] = struct{}{}
	}
	if len(unique) != 1 {
		t.Fatalf("concurrent idempotency created %d distinct executions, want 1", len(unique))
	}
}
