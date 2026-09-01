package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/worker"
	"github.com/neyati/flowforge/internal/workflow"
)

const (
	phase6LeaseDuration     = 300 * time.Millisecond
	phase6HeartbeatInterval = 80 * time.Millisecond
	phase6RecoveryInterval  = 50 * time.Millisecond
)

func phase6Handler(t *testing.T) (http.Handler, *pgxpool.Pool, *queue.PostgresRepository) {
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
	taskQueue := queue.NewPostgresRepository(pool, queue.WithLeaseDuration(phase6LeaseDuration))
	engine := execution.NewEngine(executionRepository, execution.NewBuiltinRuntime(nil), taskQueue)
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

func newJSONLogger(writer io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(writer, nil))
}

// queueFromPoolForTest builds a short-lease queue repository on the shared
// test pool so every worker instance in a test behaves identically.
func queueFromPoolForTest(pool *pgxpool.Pool) *queue.PostgresRepository {
	return queue.NewPostgresRepository(pool, queue.WithLeaseDuration(phase6LeaseDuration))
}

// syncBuffer makes captured logs safe for concurrent writers under -race.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.String()
}

func waitForLog(t *testing.T, logs *syncBuffer, needle string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(logs.String(), needle) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("logs did not contain %q; got:\n%s", needle, logs.String())
}

// crashRuntime simulates an uninterruptible task: the first execution of the
// target task signals liveness and then wedges like a hung process, ignoring
// cancellation until the test releases it. Later executions pass straight
// through, representing the recovered retry.
type crashRuntime struct {
	inner       execution.Runtime
	blockOn     string
	started     chan struct{}
	startedOnce sync.Once
	release     chan struct{}
	executions  atomic.Int64
}

func newCrashRuntime(inner execution.Runtime, blockOn string) *crashRuntime {
	return &crashRuntime{inner: inner, blockOn: blockOn, started: make(chan struct{}), release: make(chan struct{})}
}

func (r *crashRuntime) Execute(ctx context.Context, task workflow.Task, input json.RawMessage) (json.RawMessage, error) {
	if task.ID != r.blockOn {
		return r.inner.Execute(ctx, task, input)
	}
	count := r.executions.Add(1)
	if count == 1 {
		r.startedOnce.Do(func() { close(r.started) })
		<-r.release
	}
	return r.inner.Execute(ctx, task, input)
}

func countAttempts(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var count int
	if err := pool.QueryRow(context.Background(), query, args...).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func loadAttemptHistory(t *testing.T, pool *pgxpool.Pool, executionID, taskID string) []string {
	t.Helper()
	rows, err := pool.Query(context.Background(),
		`SELECT ta.attempt_number || ':' || ta.worker_id || ':' || ta.status FROM task_attempts ta JOIN task_runs tr ON tr.id = ta.task_run_id WHERE tr.execution_id = $1 AND tr.task_id = $2 ORDER BY ta.attempt_number`, executionID, taskID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	history := make([]string, 0)
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatal(err)
		}
		history = append(history, line)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return history
}

func startWorker(t *testing.T, name string, target *worker.Worker, ctx context.Context, group *sync.WaitGroup, errs chan<- error) {
	t.Helper()
	group.Add(1)
	go func() {
		defer group.Done()
		err := target.Run(ctx)
		if errs != nil {
			errs <- err
		}
	}()
}

// TestWorkerCrashRecoveryEndToEnd is the Phase 6 acceptance scenario:
// worker A claims a task and dies mid-execution, its lease expires, worker B
// reclaims and completes it, attempt history is preserved, and A's eventual
// late result is rejected instead of overwriting B's outcome.
func TestWorkerCrashRecoveryEndToEnd(t *testing.T) {
	handler, pool, _ := phase6Handler(t)
	token := registerAndLogin(t, handler, "phase6-crash-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 6 Crash")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{
		{ID: "start", Type: "transform", Config: json.RawMessage(`{"output":{}}`)},
		{ID: "slow", Type: "transform", Config: json.RawMessage(`{"output":{"done":true}}`), Dependencies: []string{"start"}},
		{ID: "end", Type: "transform", Config: json.RawMessage(`{"output":{}}`), Dependencies: []string{"slow"}},
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

	logs := &syncBuffer{}
	logger := newJSONLogger(logs)
	stub := newCrashRuntime(execution.NewBuiltinRuntime(nil), "slow")

	workerGroup := sync.WaitGroup{}
	errorCh := make(chan error, 4)
	workerACtx, cancelA := context.WithCancel(context.Background())
	workerA := &worker.Worker{ID: "worker-a", Queue: queueFromPoolForTest(pool), Runtime: stub, Logger: logger, HeartbeatInterval: phase6HeartbeatInterval, RecoveryInterval: phase6RecoveryInterval}
	startWorker(t, "worker-a", workerA, workerACtx, &workerGroup, errorCh)

	select {
	case <-stub.started:
	case <-time.After(5 * time.Second):
		t.Fatal("worker A never began executing the leased task")
	}

	// Simulate a hard crash: the process stops heartbeating and reporting,
	// but the wedged task remains stuck inside the (now dead) worker.
	cancelA()

	workerBCtx, cancelB := context.WithCancel(context.Background())
	// Worker B shares the counting stub so the recovered retry is observed as
	// a genuine second execution of the task.
	workerB := &worker.Worker{ID: "worker-b", Queue: queueFromPoolForTest(pool), Runtime: stub, Logger: logger, HeartbeatInterval: phase6HeartbeatInterval, RecoveryInterval: phase6RecoveryInterval}
	startWorker(t, "worker-b", workerB, workerBCtx, &workerGroup, errorCh)

	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancelB()

	// Worker A's wedged task finally unwinds and tries to report success for
	// a lease it lost long ago. It must be fenced off and never overwrite
	// worker B's result.
	close(stub.release)
	workerGroup.Wait()

	history := loadAttemptHistory(t, pool, created.ID.String(), "slow")
	if len(history) != 2 ||
		!strings.HasPrefix(history[0], "1:worker-a:worker_lost") ||
		!strings.HasPrefix(history[1], "2:worker-b:succeeded") {
		t.Fatalf("unexpected attempt history: %v", history)
	}
	waitForLog(t, logs, "stale result discarded; lease no longer owned")

	var finalOutput []byte
	if err := pool.QueryRow(context.Background(),
		`SELECT output FROM task_runs WHERE execution_id = $1 AND task_id = 'slow'`, created.ID.String()).Scan(&finalOutput); err != nil {
		t.Fatal(err)
	}
	// The definition round-trips a jsonb column, so compare semantically:
	// whitespace may differ but the payload must be exactly worker B's result.
	var storedOutput map[string]any
	if err := json.Unmarshal(finalOutput, &storedOutput); err != nil {
		t.Fatal(err)
	}
	if normalized, err := json.Marshal(storedOutput); err != nil || string(normalized) != `{"done":true}` {
		t.Fatalf("slow output overwritten: %s", finalOutput)
	}
}

func TestAtLeastOnceSideEffectRerunAfterCrash(t *testing.T) {
	handler, pool, _ := phase6Handler(t)
	token := registerAndLogin(t, handler, "phase6-atleastonce-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 6 AtLeastOnce")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "side-effect", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	var created execution.Execution
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d", response.Code)
	}
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	stub := newCrashRuntime(execution.NewBuiltinRuntime(nil), "side-effect")
	workerGroup := sync.WaitGroup{}
	errorCh := make(chan error, 4)

	workerACtx, cancelA := context.WithCancel(context.Background())
	workerA := &worker.Worker{ID: "worker-a", Queue: queueFromPoolForTest(pool), Runtime: stub, HeartbeatInterval: phase6HeartbeatInterval, RecoveryInterval: phase6RecoveryInterval}
	startWorker(t, "worker-a", workerA, workerACtx, &workerGroup, errorCh)
	select {
	case <-stub.started:
	case <-time.After(5 * time.Second):
		t.Fatal("worker A never executed the side effect")
	}
	cancelA()

	workerBCtx, cancelB := context.WithCancel(context.Background())
	// Worker B uses the same counting stub so its recovery rerun counts as
	// the second execution required by at-least-once semantics.
	workerB := &worker.Worker{ID: "worker-b", Queue: queueFromPoolForTest(pool), Runtime: stub, HeartbeatInterval: phase6HeartbeatInterval, RecoveryInterval: phase6RecoveryInterval}
	startWorker(t, "worker-b", workerB, workerBCtx, &workerGroup, errorCh)
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancelB()
	close(stub.release)
	workerGroup.Wait()

	if got := stub.executions.Load(); got != 2 {
		t.Fatalf("side effect executed %d times, want exactly 2 (at-least-once)", got)
	}
	history := loadAttemptHistory(t, pool, created.ID.String(), "side-effect")
	if len(history) != 2 ||
		!strings.HasPrefix(history[0], "1:worker-a:worker_lost") ||
		!strings.HasPrefix(history[1], "2:worker-b:succeeded") {
		t.Fatalf("unexpected attempt history: %v", history)
	}
}

// TestHealthyHeartbeatsKeepLongTaskLeased proves the positive control: a live
// worker renewing its lease faster than expiry keeps ownership of a long task
// and is never stolen from.
func TestHealthyHeartbeatsKeepLongTaskLeased(t *testing.T) {
	handler, pool, _ := phase6Handler(t)
	token := registerAndLogin(t, handler, "phase6-heartbeat-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 6 Heartbeat")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "long", Type: "delay", Config: json.RawMessage(`{"seconds":1.2}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	var created execution.Execution
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d", response.Code)
	}
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	workerCtx, cancel := context.WithCancel(context.Background())
	workerGroup := sync.WaitGroup{}
	target := &worker.Worker{ID: "steady-worker", Queue: queueFromPoolForTest(pool), Runtime: execution.NewBuiltinRuntime(nil), HeartbeatInterval: phase6HeartbeatInterval, RecoveryInterval: phase6RecoveryInterval}
	startWorker(t, "steady-worker", target, workerCtx, &workerGroup, nil)
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancel()
	workerGroup.Wait()

	attempts := countAttempts(t, pool,
		`SELECT COUNT(*) FROM task_attempts ta JOIN task_runs tr ON tr.id = ta.task_run_id WHERE tr.execution_id = $1`, created.ID.String())
	if attempts != 1 {
		t.Fatalf("healthy worker lost its lease: attempts = %d, want 1", attempts)
	}
}

// TestWorkerRestartResumesQueuedWork proves durable work survives worker
// stop/start cycles: a shutdown abandons its in-flight attempt, the lease
// expires, and a restarted worker recovers and finishes the job.
func TestWorkerRestartResumesQueuedWork(t *testing.T) {
	handler, pool, _ := phase6Handler(t)
	token := registerAndLogin(t, handler, "phase6-restart-"+time.Now().Format("150405.000000000")+"@example.com", "Phase 6 Restart")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "resumable", Type: "delay", Config: json.RawMessage(`{"seconds":0.4}`)}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	var created execution.Execution
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d", response.Code)
	}
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}

	firstGroup := sync.WaitGroup{}
	firstCtx, cancelFirst := context.WithCancel(context.Background())
	first := &worker.Worker{ID: "recycled-worker", Queue: queueFromPoolForTest(pool), Runtime: execution.NewBuiltinRuntime(nil), HeartbeatInterval: phase6HeartbeatInterval, RecoveryInterval: phase6RecoveryInterval}
	startWorker(t, "recycled-worker", first, firstCtx, &firstGroup, nil)

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if countAttempts(t, pool,
			`SELECT COUNT(*) FROM task_attempts ta JOIN task_runs tr ON tr.id = ta.task_run_id WHERE tr.execution_id = $1`, created.ID.String()) > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancelFirst()
	firstGroup.Wait()

	secondGroup := sync.WaitGroup{}
	restartedCtx, cancelSecond := context.WithCancel(context.Background())
	restarted := &worker.Worker{ID: "recycled-worker", Queue: queueFromPoolForTest(pool), Runtime: execution.NewBuiltinRuntime(nil), HeartbeatInterval: phase6HeartbeatInterval, RecoveryInterval: phase6RecoveryInterval}
	startWorker(t, "recycled-worker-restart", restarted, restartedCtx, &secondGroup, nil)
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	cancelSecond()
	secondGroup.Wait()

	attempts := countAttempts(t, pool,
		`SELECT COUNT(*) FROM task_attempts ta JOIN task_runs tr ON tr.id = ta.task_run_id WHERE tr.execution_id = $1`, created.ID.String())
	if attempts < 2 {
		t.Fatalf("restart did not record a fresh attempt: attempts = %d, want >= 2", attempts)
	}
}
