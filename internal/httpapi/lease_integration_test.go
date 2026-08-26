package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/queue"
)

const leaseTestLeaseDuration = 300 * time.Millisecond

func leaseTestSetup(t *testing.T) (*pgxpool.Pool, *queue.PostgresRepository) {
	t.Helper()
	_, pool, taskQueue := phase6Handler(t)
	leaseResetState(t, pool)
	return pool, taskQueue
}

// leaseResetState gives every low-level lease test a pristine queue so global
// counts and claim winners are deterministic even though integration tests
// share one database.
func leaseResetState(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`TRUNCATE task_queue, task_attempts, task_runs, executions, workflow_versions, workflows, projects, users CASCADE`); err != nil {
		t.Fatalf("reset integration state: %v", err)
	}
}

// leaseSeedQueuedTask inserts the minimum ownership chain (user -> project ->
// workflow -> version -> execution -> task_run) and enqueues the task run.
func leaseSeedQueuedTask(t *testing.T, pool *pgxpool.Pool, repository *queue.PostgresRepository, taskID string) (executionID, taskRunID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	now := time.Now().UTC()
	userID := uuid.New()
	projectID := uuid.New()
	workflowID := uuid.New()
	versionID := uuid.New()
	executionID = uuid.New()
	taskRunID = uuid.New()

	leaseExec(t, pool, `INSERT INTO users (id, email, display_name, status, created_at, updated_at) VALUES ($1, $2, 'Lease Tester', 'active', $3, $3)`,
		userID, fmt.Sprintf("lease-%s@example.com", userID), now)
	leaseExec(t, pool, `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at) VALUES ($1, $2, $3, 'active', $4, $4)`,
		projectID, userID, "Project "+userID.String(), now)
	leaseExec(t, pool, `INSERT INTO workflows (id, project_id, name, draft_definition, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`,
		workflowID, projectID, "Workflow "+workflowID.String(), json.RawMessage(`{"tasks":[]}`), now)
	definition, err := json.Marshal(map[string]any{"tasks": []map[string]any{{"id": taskID, "type": "transform", "config": map[string]any{"output": map[string]any{"ok": true}}}}})
	if err != nil {
		t.Fatal(err)
	}
	leaseExec(t, pool, `INSERT INTO workflow_versions (id, workflow_id, version_number, definition, created_at) VALUES ($1, $2, 1, $3, $4)`,
		versionID, workflowID, definition, now)
	leaseExec(t, pool, `INSERT INTO executions (id, project_id, workflow_id, workflow_version_id, status, input, created_at) VALUES ($1, $2, $3, $4, 'running', '{}', $5)`,
		executionID, projectID, workflowID, versionID, now)
	leaseExec(t, pool, `INSERT INTO task_runs (id, execution_id, task_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)`,
		taskRunID, executionID, taskID, now)
	if err := repository.Enqueue(ctx, taskRunID, now); err != nil {
		t.Fatalf("enqueue seeded task: %v", err)
	}
	return executionID, taskRunID
}

func leaseExec(t *testing.T, pool *pgxpool.Pool, query string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), query, args...); err != nil {
		t.Fatalf("seed exec %q: %v", query, err)
	}
}

func leaseQueryTime(t *testing.T, pool *pgxpool.Pool, query string, args ...any) time.Time {
	t.Helper()
	var value time.Time
	if err := pool.QueryRow(context.Background(), query, args...).Scan(&value); err != nil {
		t.Fatalf("query %q: %v", query, err)
	}
	return value
}

func leaseAssertTimeAlmostEqual(t *testing.T, label string, actual, expected time.Time) {
	t.Helper()
	delta := actual.Sub(expected)
	if delta < 0 {
		delta = -delta
	}
	if delta > 2*time.Microsecond {
		t.Fatalf("%s = %v, want %v (±2µs)", label, actual, expected)
	}
}

type leaseAttempt struct {
	number int
	worker string
	status string
	token  string
	reason string
}

func leaseLoadAttempts(t *testing.T, pool *pgxpool.Pool, taskRunID uuid.UUID) []leaseAttempt {
	t.Helper()
	rows, err := pool.Query(context.Background(),
		`SELECT attempt_number, worker_id, status, lease_token, failure_reason FROM task_attempts WHERE task_run_id = $1 ORDER BY attempt_number`, taskRunID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	records := make([]leaseAttempt, 0)
	for rows.Next() {
		var record leaseAttempt
		if err := rows.Scan(&record.number, &record.worker, &record.status, &record.token, &record.reason); err != nil {
			t.Fatal(err)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return records
}

func TestLeaseCreatedOnClaim(t *testing.T) {
	pool, repository := leaseTestSetup(t)
	_, taskRunID := leaseSeedQueuedTask(t, pool, repository, "lease-claim")

	now := time.Now().UTC().Truncate(time.Microsecond)
	work, err := repository.Claim(context.Background(), "worker-a", now)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if work.LeaseToken == "" || work.Attempt != 1 || work.WorkerID != "worker-a" {
		t.Fatalf("unexpected work identity: %+v", work)
	}
	var queueToken string
	var queueExpiry time.Time
	var queueWorker string
	err = pool.QueryRow(context.Background(),
		`SELECT worker_id, lease_token, lease_expires_at FROM task_queue WHERE task_run_id = $1`, taskRunID).
		Scan(&queueWorker, &queueToken, &queueExpiry)
	if err != nil {
		t.Fatal(err)
	}
	if queueWorker != "worker-a" || queueToken != work.LeaseToken {
		t.Fatalf("queue ownership mismatch: worker=%q token=%q", queueWorker, queueToken)
	}
	leaseAssertTimeAlmostEqual(t, "queue lease expiry", queueExpiry, now.Add(leaseTestLeaseDuration))
	attempts := leaseLoadAttempts(t, pool, taskRunID)
	if len(attempts) != 1 || attempts[0].number != 1 || attempts[0].worker != "worker-a" || attempts[0].status != "running" || attempts[0].token != work.LeaseToken {
		t.Fatalf("unexpected attempt history: %+v", attempts)
	}
	var runStatus string
	if err := pool.QueryRow(context.Background(), `SELECT status FROM task_runs WHERE id = $1`, taskRunID).Scan(&runStatus); err != nil {
		t.Fatal(err)
	}
	if runStatus != "running" {
		t.Fatalf("task run status = %q, want running", runStatus)
	}
}

func TestHeartbeatExtendsLease(t *testing.T) {
	pool, repository := leaseTestSetup(t)
	_, taskRunID := leaseSeedQueuedTask(t, pool, repository, "heartbeat")

	base := time.Now().UTC().Truncate(time.Microsecond)
	work, err := repository.Claim(context.Background(), "worker-a", base)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	firstBeat := base.Add(100 * time.Millisecond)
	if err := repository.Heartbeat(context.Background(), taskRunID, "worker-a", work.LeaseToken, firstBeat); err != nil {
		t.Fatalf("first heartbeat: %v", err)
	}
	leaseAssertTimeAlmostEqual(t, "renewed queue expiry",
		leaseQueryTime(t, pool, `SELECT lease_expires_at FROM task_queue WHERE task_run_id = $1`, taskRunID), firstBeat.Add(leaseTestLeaseDuration))
	leaseAssertTimeAlmostEqual(t, "last heartbeat",
		leaseQueryTime(t, pool, `SELECT last_heartbeat_at FROM task_queue WHERE task_run_id = $1`, taskRunID), firstBeat)
	attemptExpiry := leaseQueryTime(t, pool,
		`SELECT lease_expires_at FROM task_attempts WHERE task_run_id = $1 AND attempt_number = 1`, taskRunID)
	leaseAssertTimeAlmostEqual(t, "renewed attempt expiry", attemptExpiry, firstBeat.Add(leaseTestLeaseDuration))

	secondBeat := firstBeat.Add(50 * time.Millisecond)
	if err := repository.Heartbeat(context.Background(), taskRunID, "worker-a", work.LeaseToken, secondBeat); err != nil {
		t.Fatalf("second heartbeat: %v", err)
	}
	leaseAssertTimeAlmostEqual(t, "second renewed expiry",
		leaseQueryTime(t, pool, `SELECT lease_expires_at FROM task_queue WHERE task_run_id = $1`, taskRunID), secondBeat.Add(leaseTestLeaseDuration))
}

func TestHeartbeatRejectsInvalidOwnership(t *testing.T) {
	pool, repository := leaseTestSetup(t)
	_, taskRunID := leaseSeedQueuedTask(t, pool, repository, "heartbeat-guard")

	base := time.Now().UTC().Truncate(time.Microsecond)
	work, err := repository.Claim(context.Background(), "worker-a", base)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	cases := []struct {
		name       string
		taskRunID  uuid.UUID
		workerID   string
		leaseToken string
	}{
		{"wrong worker", taskRunID, "worker-b", work.LeaseToken},
		{"wrong token", taskRunID, "worker-a", uuid.NewString()},
		{"unknown task run", uuid.New(), "worker-a", work.LeaseToken},
	}
	for _, testCase := range cases {
		if err := repository.Heartbeat(context.Background(), testCase.taskRunID, testCase.workerID, testCase.leaseToken, base.Add(50*time.Millisecond)); !errors.Is(err, queue.ErrLeaseNotOwned) {
			t.Fatalf("%s: heartbeat error = %v, want ErrLeaseNotOwned", testCase.name, err)
		}
	}
	// Ownership state must be untouched by rejected heartbeats.
	expiry := leaseQueryTime(t, pool, `SELECT lease_expires_at FROM task_queue WHERE task_run_id = $1`, taskRunID)
	leaseAssertTimeAlmostEqual(t, "expiry unchanged", expiry, base.Add(leaseTestLeaseDuration))

	// After completion the lease no longer exists; late heartbeats are rejected.
	if err := repository.Complete(context.Background(), taskRunID, work.WorkerID, work.LeaseToken, work.Attempt, json.RawMessage(`{}`), base.Add(time.Millisecond)); err != nil {
		t.Fatalf("complete: %v", err)
	}
	if err := repository.Heartbeat(context.Background(), taskRunID, "worker-a", work.LeaseToken, base.Add(2*time.Millisecond)); !errors.Is(err, queue.ErrLeaseNotOwned) {
		t.Fatalf("post-completion heartbeat error = %v, want ErrLeaseNotOwned", err)
	}
}

func TestStaleWorkerCannotOverwriteRecoveredTask(t *testing.T) {
	pool, repository := leaseTestSetup(t)
	_, taskRunID := leaseSeedQueuedTask(t, pool, repository, "fencing")

	base := time.Now().UTC().Truncate(time.Microsecond)
	stale, err := repository.Claim(context.Background(), "worker-a", base)
	if err != nil {
		t.Fatalf("stale claim: %v", err)
	}
	recovered, err := repository.RecoverExpired(context.Background(), base.Add(400*time.Millisecond))
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	if recovered != 1 {
		t.Fatalf("recovered = %d, want 1", recovered)
	}
	fresh, err := repository.Claim(context.Background(), "worker-b", base.Add(410*time.Millisecond))
	if err != nil {
		t.Fatalf("fresh claim: %v", err)
	}
	if fresh.TaskRunID != taskRunID || fresh.Attempt != 2 {
		t.Fatalf("fresh claim = (%s, attempt %d), want (%s, attempt 2)", fresh.TaskRunID, fresh.Attempt, taskRunID)
	}

	output := json.RawMessage(`{"output":"stolen"}`)
	if err := repository.Complete(context.Background(), taskRunID, stale.WorkerID, stale.LeaseToken, stale.Attempt, output, base.Add(420*time.Millisecond)); !errors.Is(err, queue.ErrLeaseNotOwned) {
		t.Fatalf("stale complete error = %v, want ErrLeaseNotOwned", err)
	}
	if err := repository.Fail(context.Background(), taskRunID, stale.WorkerID, stale.LeaseToken, stale.Attempt, "stale failure", base.Add(430*time.Millisecond)); !errors.Is(err, queue.ErrLeaseNotOwned) {
		t.Fatalf("stale fail error = %v, want ErrLeaseNotOwned", err)
	}
	if err := repository.Heartbeat(context.Background(), taskRunID, stale.WorkerID, stale.LeaseToken, base.Add(440*time.Millisecond)); !errors.Is(err, queue.ErrLeaseNotOwned) {
		t.Fatalf("stale heartbeat error = %v, want ErrLeaseNotOwned", err)
	}

	var runOutput []byte
	var runStatus string
	if err := pool.QueryRow(context.Background(), `SELECT status, output FROM task_runs WHERE id = $1`, taskRunID).Scan(&runStatus, &runOutput); err != nil {
		t.Fatal(err)
	}
	if runStatus != "running" || string(runOutput) != "null" {
		t.Fatalf("stale worker mutated task run: status=%q output=%s", runStatus, runOutput)
	}

	if err := repository.Complete(context.Background(), fresh.TaskRunID, fresh.WorkerID, fresh.LeaseToken, fresh.Attempt, json.RawMessage(`{"output":"real"}`), base.Add(450*time.Millisecond)); err != nil {
		t.Fatalf("fresh complete: %v", err)
	}
	attempts := leaseLoadAttempts(t, pool, taskRunID)
	if len(attempts) != 2 ||
		attempts[0].status != "worker_lost" || attempts[0].worker != "worker-a" ||
		attempts[1].status != "succeeded" || attempts[1].worker != "worker-b" {
		t.Fatalf("attempt history not preserved: %+v", attempts)
	}
	if err := pool.QueryRow(context.Background(), `SELECT status, output FROM task_runs WHERE id = $1`, taskRunID).Scan(&runStatus, &runOutput); err != nil {
		t.Fatal(err)
	}
	// output is jsonb, so the server re-renders whitespace; compare semantically.
	var storedOutput map[string]any
	if err := json.Unmarshal(runOutput, &storedOutput); err != nil {
		t.Fatal(err)
	}
	if normalized, err := json.Marshal(storedOutput); err != nil || string(normalized) != `{"output":"real"}` {
		t.Fatalf("final run state = %q %s, want succeeded with real output", runStatus, runOutput)
	}
}

type leaseClaimResult struct {
	work queue.Work
	err  error
}

func TestConcurrentClaimsExactlyOneWinner(t *testing.T) {
	pool, repository := leaseTestSetup(t)
	_, taskRunID := leaseSeedQueuedTask(t, pool, repository, "contended")

	base := time.Now().UTC().Truncate(time.Microsecond)
	if _, err := repository.Claim(context.Background(), "worker-dead", base); err != nil {
		t.Fatalf("initial claim: %v", err)
	}
	if recovered, err := repository.RecoverExpired(context.Background(), base.Add(400*time.Millisecond)); err != nil || recovered != 1 {
		t.Fatalf("recover = (%d, %v), want (1, nil)", recovered, err)
	}

	const contenders = 8
	var group sync.WaitGroup
	results := make([]leaseClaimResult, contenders)
	for index := range contenders {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			work, claimErr := repository.Claim(context.Background(), fmt.Sprintf("worker-%d", index), base.Add(410*time.Millisecond))
			results[index] = leaseClaimResult{work: work, err: claimErr}
		}(index)
	}
	group.Wait()
	winners := 0
	for _, result := range results {
		if result.err == nil {
			winners++
			if result.work.TaskRunID != taskRunID {
				t.Fatalf("winner claimed unexpected task run %s", result.work.TaskRunID)
			}
			continue
		}
		if !errors.Is(result.err, queue.ErrNoWork) {
			t.Fatalf("contender error = %v, want ErrNoWork", result.err)
		}
	}
	if winners != 1 {
		t.Fatalf("concurrent reclaim winners = %d, want exactly 1", winners)
	}
}

func TestConcurrentRecoveryProcessesEachLeaseOnce(t *testing.T) {
	pool, repository := leaseTestSetup(t)
	_, taskRunID := leaseSeedQueuedTask(t, pool, repository, "sweep-race")

	base := time.Now().UTC().Truncate(time.Microsecond)
	if _, err := repository.Claim(context.Background(), "worker-dead", base); err != nil {
		t.Fatalf("claim: %v", err)
	}

	const sweepers = 8
	expiry := base.Add(400 * time.Millisecond)
	var group sync.WaitGroup
	counts := make([]int, sweepers)
	sweepErrors := make([]error, sweepers)
	for index := range sweepers {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			count, err := repository.RecoverExpired(context.Background(), expiry)
			counts[index], sweepErrors[index] = count, err
		}(index)
	}
	group.Wait()
	total := 0
	for index, err := range sweepErrors {
		if err != nil {
			t.Fatalf("sweep %d error: %v", index, err)
		}
		total += counts[index]
	}
	if total != 1 {
		t.Fatalf("expired lease processed %d times across sweeps, want exactly 1", total)
	}
	attempts := leaseLoadAttempts(t, pool, taskRunID)
	if len(attempts) != 1 || attempts[0].status != "worker_lost" {
		t.Fatalf("unexpected attempt history: %+v", attempts)
	}
}

func TestMaxAttemptsExhaustionMarksTerminalFailure(t *testing.T) {
	pool, _ := leaseTestSetup(t)
	exhausting := queue.NewPostgresRepository(pool, queue.WithLeaseDuration(leaseTestLeaseDuration), queue.WithMaxAttempts(2))
	_, taskRunID := leaseSeedQueuedTask(t, pool, exhausting, "exhausted")

	base := time.Now().UTC().Truncate(time.Microsecond)
	if _, err := exhausting.Claim(context.Background(), "worker-a", base); err != nil {
		t.Fatalf("first claim: %v", err)
	}
	if recovered, err := exhausting.RecoverExpired(context.Background(), base.Add(400*time.Millisecond)); err != nil || recovered != 1 {
		t.Fatalf("first recovery = (%d, %v), want (1, nil)", recovered, err)
	}
	second, err := exhausting.Claim(context.Background(), "worker-b", base.Add(410*time.Millisecond))
	if err != nil {
		t.Fatalf("second claim: %v", err)
	}
	if second.TaskRunID != taskRunID || second.Attempt != 2 {
		t.Fatalf("second claim = (%s, attempt %d), want (%s, attempt 2)", second.TaskRunID, second.Attempt, taskRunID)
	}
	recovered, err := exhausting.RecoverExpired(context.Background(), base.Add(800*time.Millisecond))
	if err != nil {
		t.Fatalf("final recovery: %v", err)
	}
	if recovered != 1 {
		t.Fatalf("final recovery count = %d, want 1 (terminal transition)", recovered)
	}

	attempts := leaseLoadAttempts(t, pool, taskRunID)
	if len(attempts) != 2 || attempts[0].status != "worker_lost" || attempts[1].status != "worker_lost" {
		t.Fatalf("attempt history: %+v", attempts)
	}
	var queueStatus string
	if err := pool.QueryRow(context.Background(), `SELECT status FROM task_queue WHERE task_run_id = $1`, taskRunID).Scan(&queueStatus); err != nil {
		t.Fatal(err)
	}
	if queueStatus != "failed" {
		t.Fatalf("queue status = %q, want failed", queueStatus)
	}
	var runStatus, runReason string
	if err := pool.QueryRow(context.Background(), `SELECT status, failure_reason FROM task_runs WHERE id = $1`, taskRunID).Scan(&runStatus, &runReason); err != nil {
		t.Fatal(err)
	}
	if runStatus != "failed" || runReason != "worker lost after 2 attempts" {
		t.Fatalf("terminal run = %q %q", runStatus, runReason)
	}

	// A terminal task must never become claimable again.
	if _, err := exhausting.Claim(context.Background(), "worker-c", base.Add(900*time.Millisecond)); !errors.Is(err, queue.ErrNoWork) {
		t.Fatalf("claim after exhaustion error = %v, want ErrNoWork", err)
	}
}
