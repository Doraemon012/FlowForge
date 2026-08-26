package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/worker"
	"github.com/neyati/flowforge/internal/workflow"
)

func TestTwoWorkersClaimIndependentTasksConcurrently(t *testing.T) {
	handler, pool, taskQueue, executionRepository := phase5Handler(t)
	defer pool.Close()
	token := registerAndLogin(t, handler, "phase5-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 5")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}, {ID: "b", Type: "delay", Config: json.RawMessage(`{"seconds":0.15}`), Dependencies: []string{"a"}}, {ID: "c", Type: "delay", Config: json.RawMessage(`{"seconds":0.15}`), Dependencies: []string{"a"}}, {ID: "d", Type: "transform", Config: json.RawMessage(`{"output":{}}`), Dependencies: []string{"b", "c"}}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	path := "/api/v1/projects/" + projectID + "/workflows/" + workflowID + "/executions"
	response := requestJSON(handler, http.MethodPost, path, map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d, body = %s", response.Code, response.Body.String())
	}
	var created execution.Execution
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	waitForQueueCount(t, taskQueue, 1)
	var claimed [2]queue.Work
	var claimErrors [2]error
	var group sync.WaitGroup
	for index := range claimed {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			claimed[index], claimErrors[index] = taskQueue.Claim(context.Background(), "worker-"+string(rune('1'+index)), time.Now().UTC())
		}(index)
	}
	group.Wait()
	claimedCount := 0
	for index := range claimed {
		if claimErrors[index] == nil {
			claimedCount++
		}
	}
	if claimedCount != 1 {
		t.Fatalf("concurrent claim count = %d, want 1; errors = %v", claimedCount, claimErrors)
	}

	claimedWork := claimed[0]
	if claimErrors[0] != nil {
		claimedWork = claimed[1]
	}
	if err := executionRepository.SetTaskSucceeded(context.Background(), claimedWork.TaskRunID, json.RawMessage(`{}`), time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	if err := taskQueue.Complete(context.Background(), claimedWork.TaskRunID, claimedWork.WorkerID, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}

	// The engine will enqueue the second branch only after the first task completes.
	waitForQueueCount(t, taskQueue, 1)
	workerOne := &worker.Worker{ID: "worker-one", Queue: taskQueue, Executions: executionRepository, Runtime: execution.NewBuiltinRuntime(nil)}
	workerTwo := &worker.Worker{ID: "worker-two", Queue: taskQueue, Executions: executionRepository, Runtime: execution.NewBuiltinRuntime(nil)}
	ctx, cancel := context.WithCancel(context.Background())
	var workerGroup sync.WaitGroup
	workerGroup.Add(2)
	go func() { defer workerGroup.Done(); _ = workerOne.Run(ctx) }()
	go func() { defer workerGroup.Done(); _ = workerTwo.Run(ctx) }()
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancel()
	workerGroup.Wait()
}

func phase5Handler(t *testing.T) (http.Handler, interface{ Close() }, *queue.PostgresRepository, *execution.PostgresRepository) {
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
	executionRepository := execution.NewPostgresRepository(pool)
	taskQueue := queue.NewPostgresRepository(pool)
	engine := execution.NewEngine(executionRepository, execution.NewBuiltinRuntime(nil), taskQueue)
	handler := NewExecutionServer(pool, user.NewPostgresRepository(pool), project.NewPostgresRepository(pool), workflow.NewPostgresRepository(pool), executionRepository, engine, auth.NewTokenService("01234567890123456789012345678901")).Router()
	return handler, pool, taskQueue, executionRepository
}

func waitForQueueCount(t *testing.T, taskQueue queue.Repository, minimum int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		count, err := taskQueue.QueuedCount(context.Background())
		if err == nil && count >= minimum {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("queue did not reach %d queued tasks", minimum)
}
