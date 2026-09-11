package execution

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/workflow"
)

// cancelFixture describes one seeded execution: task "a" is running under a
// live worker claim, task "b" is queued, and task "c" has not been queued yet.
// That is the interesting case for cancellation - work in flight, work about to
// be claimed, and work that was never started.
type cancelFixture struct {
	ownerID     uuid.UUID
	executionID uuid.UUID
	taskRunIDs  map[string]uuid.UUID
	workerID    string
	leaseToken  string
}

func cancelTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	pool, err := db.Open(context.Background(), databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func seedCancellableRun(t *testing.T, pool *pgxpool.Pool) cancelFixture {
	t.Helper()
	ctx := context.Background()
	now := time.Now().UTC()

	fixture := cancelFixture{
		ownerID:     uuid.New(),
		executionID: uuid.New(),
		taskRunIDs:  map[string]uuid.UUID{"a": uuid.New(), "b": uuid.New(), "c": uuid.New()},
		workerID:    "worker-1",
		leaseToken:  uuid.NewString(),
	}
	projectID := uuid.New()
	workflowID := uuid.New()
	versionID := uuid.New()

	definition, err := json.Marshal(workflow.Definition{Tasks: []workflow.Task{
		{ID: "a", Type: "transform"},
		{ID: "b", Type: "transform", Dependencies: []string{"a"}},
		{ID: "c", Type: "transform", Dependencies: []string{"b"}},
	}})
	if err != nil {
		t.Fatalf("encode definition: %v", err)
	}

	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users (id, email, display_name, status, created_at, updated_at) VALUES ($1, $2, 'Cancel', 'active', $3, $3)`,
			[]any{fixture.ownerID, "cancel-" + fixture.ownerID.String() + "@example.com", now}},
		{`INSERT INTO projects (id, owner_id, name, status, created_at, updated_at) VALUES ($1, $2, 'Cancel project', 'active', $3, $3)`,
			[]any{projectID, fixture.ownerID, now}},
		{`INSERT INTO workflows (id, project_id, name, draft_definition, status, created_at, updated_at) VALUES ($1, $2, 'Cancel workflow', $3, 'draft', $4, $4)`,
			[]any{workflowID, projectID, definition, now}},
		{`INSERT INTO workflow_versions (id, workflow_id, version_number, definition, created_at) VALUES ($1, $2, 1, $3, $4)`,
			[]any{versionID, workflowID, definition, now}},
		{`INSERT INTO executions (id, project_id, workflow_id, workflow_version_id, status, input, created_at, started_at) VALUES ($1, $2, $3, $4, 'running', '{}', $5, $5)`,
			[]any{fixture.executionID, projectID, workflowID, versionID, now}},
		{`INSERT INTO task_runs (id, execution_id, task_id, status, created_at, started_at) VALUES ($1, $2, 'a', 'running', $3, $3)`,
			[]any{fixture.taskRunIDs["a"], fixture.executionID, now}},
		{`INSERT INTO task_runs (id, execution_id, task_id, status, created_at) VALUES ($1, $2, 'b', 'queued', $3)`,
			[]any{fixture.taskRunIDs["b"], fixture.executionID, now}},
		{`INSERT INTO task_runs (id, execution_id, task_id, status, created_at) VALUES ($1, $2, 'c', 'pending', $3)`,
			[]any{fixture.taskRunIDs["c"], fixture.executionID, now}},
		{`INSERT INTO task_queue (id, task_run_id, status, worker_id, created_at, claimed_at, attempt_number, lease_token, lease_expires_at, last_heartbeat_at) VALUES ($1, $2, 'claimed', $3, $4, $4, 1, $5, $6, $4)`,
			[]any{uuid.New(), fixture.taskRunIDs["a"], fixture.workerID, now, fixture.leaseToken, now.Add(time.Minute)}},
		{`INSERT INTO task_queue (id, task_run_id, status, created_at) VALUES ($1, $2, 'queued', $3)`,
			[]any{uuid.New(), fixture.taskRunIDs["b"], now}},
		{`INSERT INTO task_attempts (id, task_run_id, attempt_number, worker_id, lease_token, status, started_at, heartbeat_at, lease_expires_at) VALUES ($1, $2, 1, $3, $4, 'running', $5, $5, $6)`,
			[]any{uuid.New(), fixture.taskRunIDs["a"], fixture.workerID, fixture.leaseToken, now, now.Add(time.Minute)}},
	}
	for _, statement := range statements {
		if _, err := pool.Exec(ctx, statement.query, statement.args...); err != nil {
			t.Fatalf("seed %q: %v", statement.query, err)
		}
	}
	return fixture
}

func taskRunStatuses(t *testing.T, pool *pgxpool.Pool, executionID uuid.UUID) map[string]string {
	t.Helper()
	rows, err := pool.Query(context.Background(), `SELECT task_id, status FROM task_runs WHERE execution_id = $1`, executionID)
	if err != nil {
		t.Fatalf("list task runs: %v", err)
	}
	defer rows.Close()
	statuses := make(map[string]string, 3)
	for rows.Next() {
		var taskID, status string
		if err := rows.Scan(&taskID, &status); err != nil {
			t.Fatalf("scan task run: %v", err)
		}
		statuses[taskID] = status
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate task runs: %v", err)
	}
	return statuses
}

func assertStatuses(t *testing.T, pool *pgxpool.Pool, fixture cancelFixture, want map[string]string) {
	t.Helper()
	got := taskRunStatuses(t, pool, fixture.executionID)
	for taskID, wantStatus := range want {
		if got[taskID] != wantStatus {
			t.Fatalf("task %q status = %q, want %q (all: %v)", taskID, got[taskID], wantStatus, got)
		}
	}
}

// TestCancelOwnedStopsInFlightWork is the regression test for cancellation
// reaching work that is already running. Before it, a claimed task kept its
// lease, ran to completion, and a transient failure could even put it back in
// the claimable queue - so a cancelled execution could quietly resume.
func TestCancelOwnedStopsInFlightWork(t *testing.T) {
	pool := cancelTestPool(t)
	ctx := context.Background()
	fixture := seedCancellableRun(t, pool)
	repository := NewPostgresRepository(pool)

	cancelled, err := repository.CancelOwned(ctx, fixture.ownerID, fixture.executionID, time.Now().UTC())
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if cancelled.Status != "cancelled" {
		t.Fatalf("cancelled status = %q, want %q", cancelled.Status, "cancelled")
	}
	if cancelled.CompletedAt == nil {
		t.Fatal("cancelled execution has no completed_at")
	}

	assertStatuses(t, pool, fixture, map[string]string{"a": "cancelled", "b": "cancelled", "c": "cancelled"})

	var actionable int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM task_queue q JOIN task_runs tr ON tr.id = q.task_run_id WHERE tr.execution_id = $1 AND q.status IN ('queued', 'claimed')`, fixture.executionID).Scan(&actionable); err != nil {
		t.Fatalf("count actionable queue rows: %v", err)
	}
	if actionable != 0 {
		t.Fatalf("cancelled execution still has %d queue row(s) a worker could claim", actionable)
	}

	var claimedLeases int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM task_queue q JOIN task_runs tr ON tr.id = q.task_run_id WHERE tr.execution_id = $1 AND q.lease_token IS NOT NULL`, fixture.executionID).Scan(&claimedLeases); err != nil {
		t.Fatalf("count live leases: %v", err)
	}
	if claimedLeases != 0 {
		t.Fatalf("cancelled execution still holds %d live lease(s)", claimedLeases)
	}

	var attemptStatus, attemptReason string
	if err := pool.QueryRow(ctx, `SELECT status, failure_reason FROM task_attempts WHERE task_run_id = $1 AND attempt_number = 1`, fixture.taskRunIDs["a"]).Scan(&attemptStatus, &attemptReason); err != nil {
		t.Fatalf("load attempt: %v", err)
	}
	if attemptStatus != "cancelled" || attemptReason != "execution cancelled" {
		t.Fatalf("attempt = (%q, %q), want (%q, %q)", attemptStatus, attemptReason, "cancelled", "execution cancelled")
	}

	// The interrupted worker's late result is fenced out by the queue lease, so
	// it can neither succeed nor fail-resume the cancelled run.
	results := queue.NewPostgresRepository(pool)
	err = results.Complete(ctx, fixture.taskRunIDs["a"], fixture.workerID, fixture.leaseToken, 1, json.RawMessage(`{"late":true}`), time.Now().UTC())
	if !errors.Is(err, queue.ErrLeaseNotOwned) {
		t.Fatalf("late result error = %v, want %v", err, queue.ErrLeaseNotOwned)
	}
	assertStatuses(t, pool, fixture, map[string]string{"a": "cancelled"})

	again, err := repository.CancelOwned(ctx, fixture.ownerID, fixture.executionID, time.Now().UTC())
	if err != nil {
		t.Fatalf("second cancel: %v", err)
	}
	if again.Status != "cancelled" {
		t.Fatalf("second cancel status = %q, want %q", again.Status, "cancelled")
	}
}

// TestCancelOwnedLeavesFinishedRunsAlone pins the rest of the state-transition
// contract: cancelling is only powerful while a run is pending or running, and
// a finished run is returned untouched rather than reopened.
func TestCancelOwnedLeavesFinishedRunsAlone(t *testing.T) {
	pool := cancelTestPool(t)
	ctx := context.Background()
	fixture := seedCancellableRun(t, pool)
	repository := NewPostgresRepository(pool)

	if _, err := pool.Exec(ctx, `UPDATE executions SET status = 'completed', completed_at = $2 WHERE id = $1`, fixture.executionID, time.Now().UTC()); err != nil {
		t.Fatalf("finish execution: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE task_runs SET status = 'succeeded', completed_at = $2 WHERE execution_id = $1`, fixture.executionID, time.Now().UTC()); err != nil {
		t.Fatalf("finish task runs: %v", err)
	}

	unchanged, err := repository.CancelOwned(ctx, fixture.ownerID, fixture.executionID, time.Now().UTC())
	if err != nil {
		t.Fatalf("cancel finished run: %v", err)
	}
	if unchanged.Status != "completed" {
		t.Fatalf("finished run status = %q, want %q", unchanged.Status, "completed")
	}
	assertStatuses(t, pool, fixture, map[string]string{"a": "succeeded", "b": "succeeded", "c": "succeeded"})

	if _, err := repository.CancelOwned(ctx, fixture.ownerID, uuid.New(), time.Now().UTC()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cancelling an unknown execution error = %v, want %v", err, ErrNotFound)
	}
}
