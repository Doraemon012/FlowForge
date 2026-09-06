package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/workflow"
)

var ErrNoWork = errors.New("no queued work")
var ErrLeaseNotOwned = errors.New("lease is not owned by worker")

const defaultLeaseDuration = 10 * time.Second
const defaultMaxAttempts = 3

const (
	retryBaseDelay = 1 * time.Second
	retryMaxDelay  = 30 * time.Second
)

// retryBackoff returns an exponential backoff with a cap and a small
// deterministic jitter derived from the attempt number. Keeping the jitter
// deterministic makes retry behavior reproducible in tests while still
// spreading concurrent retries away from a synchronized thundering herd.
func retryBackoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := retryBaseDelay * time.Duration(1<<(attempt-1))
	if delay > retryMaxDelay {
		delay = retryMaxDelay
	}
	jitter := time.Duration(attempt%5) * 100 * time.Millisecond
	return delay + jitter
}

type Work struct {
	QueueID       uuid.UUID
	ProjectID     uuid.UUID
	TaskRunID     uuid.UUID
	ExecutionID   uuid.UUID
	TaskAttemptID uuid.UUID
	Task          workflow.Task
	Input         json.RawMessage
	WorkerID      string
	LeaseToken    string
	Attempt       int
}

type Repository interface {
	Enqueue(ctx context.Context, taskRunID uuid.UUID, now time.Time) error
	Claim(ctx context.Context, workerID string, now time.Time) (Work, error)
	Heartbeat(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, now time.Time) error
	RecoverExpired(ctx context.Context, now time.Time) (int, error)
	Complete(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, attempt int, output json.RawMessage, now time.Time) error
	Fail(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, attempt int, reason string, now time.Time) error
	QueuedCount(ctx context.Context) (int, error)
}

type Option func(*PostgresRepository)

func WithLeaseDuration(leaseDuration time.Duration) Option {
	return func(repository *PostgresRepository) {
		if leaseDuration > 0 {
			repository.leaseDuration = leaseDuration
		}
	}
}

// WithMaxAttempts bounds how many times a single task run may be re-claimed
// after worker loss before it is marked terminal. A task that keeps losing
// its worker is treated as an unrecoverable failure rather than an infinite
// retry loop.
func WithMaxAttempts(maxAttempts int) Option {
	return func(repository *PostgresRepository) {
		if maxAttempts > 0 {
			repository.maxAttempts = maxAttempts
		}
	}
}

type PostgresRepository struct {
	pool          *pgxpool.Pool
	leaseDuration time.Duration
	maxAttempts   int
}

func NewPostgresRepository(pool *pgxpool.Pool, options ...Option) *PostgresRepository {
	repository := &PostgresRepository{pool: pool, leaseDuration: defaultLeaseDuration, maxAttempts: defaultMaxAttempts}
	for _, option := range options {
		option(repository)
	}
	return repository
}

func (r *PostgresRepository) Enqueue(ctx context.Context, taskRunID uuid.UUID, now time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE task_runs SET status = 'queued' WHERE id = $1 AND status = 'pending'`, taskRunID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO task_queue (id, task_run_id, status, created_at) VALUES ($1, $2, 'queued', $3) ON CONFLICT (task_run_id) DO NOTHING`, uuid.New(), taskRunID, now); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresRepository) Claim(ctx context.Context, workerID string, now time.Time) (Work, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Work{}, err
	}
	defer tx.Rollback(ctx)
	var queueID, taskRunID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id, task_run_id FROM task_queue WHERE status = 'queued' AND (not_before IS NULL OR not_before <= $1) ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`, now).Scan(&queueID, &taskRunID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Work{}, ErrNoWork
	}
	if err != nil {
		return Work{}, err
	}
	leaseToken := uuid.NewString()
	leaseExpiresAt := now.Add(r.leaseDuration)
	attempt := 0
	if err := tx.QueryRow(ctx, `SELECT attempt_number + 1 FROM task_queue WHERE id = $1`, queueID).Scan(&attempt); err != nil {
		return Work{}, err
	}
	var work Work
	var workTaskID string
	var definition []byte
	var executionInput json.RawMessage
	err = tx.QueryRow(ctx, `
		SELECT q.id, e.project_id, tr.id, tr.execution_id, tr.task_id, e.input, wv.definition
		FROM task_queue q
		JOIN task_runs tr ON tr.id = q.task_run_id
		JOIN executions e ON e.id = tr.execution_id
		JOIN workflow_versions wv ON wv.id = e.workflow_version_id
		WHERE q.id = $1 AND q.status = 'queued'`, queueID).Scan(&work.QueueID, &work.ProjectID, &work.TaskRunID, &work.ExecutionID, &workTaskID, &executionInput, &definition)
	if err != nil {
		return Work{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE task_queue SET status = 'claimed', worker_id = $1, claimed_at = $2, lease_token = $3, lease_expires_at = $4, last_heartbeat_at = $2, attempt_number = $5 WHERE id = $6 AND status = 'queued'`, workerID, now, leaseToken, leaseExpiresAt, attempt, queueID); err != nil {
		return Work{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE task_runs SET status = 'running', started_at = $1, failure_reason = '' WHERE id = $2 AND status = 'queued'`, now, taskRunID); err != nil {
		return Work{}, err
	}
	attemptID := uuid.New()
	if _, err := tx.Exec(ctx, `INSERT INTO task_attempts (id, task_run_id, attempt_number, worker_id, lease_token, status, started_at, heartbeat_at, lease_expires_at) VALUES ($1, $2, $3, $4, $5, 'running', $6, $6, $7)`, attemptID, taskRunID, attempt, workerID, leaseToken, now, leaseExpiresAt); err != nil {
		return Work{}, err
	}
	work.TaskAttemptID = attemptID
	if err := tx.Commit(ctx); err != nil {
		return Work{}, err
	}
	var workflowDefinition workflow.Definition
	if err := json.Unmarshal(definition, &workflowDefinition); err != nil {
		return Work{}, err
	}
	for _, task := range workflowDefinition.Tasks {
		if task.ID == workTaskID {
			work.Task = task
			break
		}
	}
	if work.Task.ID == "" {
		return Work{}, errors.New("task definition not found")
	}
	work.Input = executionInput
	if len(work.Task.Dependencies) > 0 {
		dependencyOutputs := make(map[string]json.RawMessage, len(work.Task.Dependencies))
		for _, dependencyID := range work.Task.Dependencies {
			var output json.RawMessage
			if err := r.pool.QueryRow(ctx, `
				SELECT output
				FROM task_runs
				WHERE execution_id = $1 AND task_id = $2 AND status = 'succeeded'
			`, work.ExecutionID, dependencyID).Scan(&output); err != nil {
				return Work{}, fmt.Errorf("load dependency output for %s: %w", dependencyID, err)
			}
			dependencyOutputs[dependencyID] = output
		}
		if len(dependencyOutputs) == 1 {
			for _, output := range dependencyOutputs {
				work.Input = output
			}
		} else if encoded, err := json.Marshal(dependencyOutputs); err != nil {
			return Work{}, fmt.Errorf("encode dependency outputs: %w", err)
		} else {
			work.Input = encoded
		}
	}
	work.WorkerID = workerID
	work.LeaseToken = leaseToken
	work.Attempt = attempt
	return work, nil
}

func (r *PostgresRepository) Heartbeat(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, now time.Time) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE task_queue
		SET last_heartbeat_at = $1, lease_expires_at = $2
		WHERE task_run_id = $3 AND status = 'claimed' AND worker_id = $4 AND lease_token = $5`, now, now.Add(r.leaseDuration), taskRunID, workerID, leaseToken)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrLeaseNotOwned
	}
	tag, err = r.pool.Exec(ctx, `
		UPDATE task_attempts
		SET heartbeat_at = $1, lease_expires_at = $2
		WHERE task_run_id = $3 AND attempt_number = (
			SELECT attempt_number FROM task_queue WHERE task_run_id = $3
		) AND worker_id = $4 AND lease_token = $5 AND status = 'running'`, now, now.Add(r.leaseDuration), taskRunID, workerID, leaseToken)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrLeaseNotOwned
	}
	return nil
}

func (r *PostgresRepository) RecoverExpired(ctx context.Context, now time.Time) (int, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT id, task_run_id, attempt_number, worker_id, lease_token
		FROM task_queue
		WHERE status = 'claimed' AND lease_expires_at <= $1
		ORDER BY lease_expires_at, id
		FOR UPDATE SKIP LOCKED`, now)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type expiredLease struct {
		queueID       uuid.UUID
		taskRunID     uuid.UUID
		attemptNumber int
		workerID      string
		leaseToken    string
	}

	items := make([]expiredLease, 0)
	for rows.Next() {
		var item expiredLease
		if err := rows.Scan(&item.queueID, &item.taskRunID, &item.attemptNumber, &item.workerID, &item.leaseToken); err != nil {
			return 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, item := range items {
		if _, err := tx.Exec(ctx, `
			UPDATE task_attempts
			SET status = 'worker_lost', completed_at = $1, failure_reason = 'worker heartbeat expired', failure_classification = 'transient'
			WHERE task_run_id = $2 AND attempt_number = $3 AND worker_id = $4 AND lease_token = $5 AND status = 'running'`, now, item.taskRunID, item.attemptNumber, item.workerID, item.leaseToken); err != nil {
			return 0, err
		}
		// A task that exhausted its attempts through repeated worker loss is
		// terminal: dependents block and the execution fails like any other
		// failed predecessor instead of looping forever.
		if item.attemptNumber >= r.maxAttempts {
			reason := fmt.Sprintf("worker lost after %d attempts", item.attemptNumber)
			if _, err := tx.Exec(ctx, `
				UPDATE task_queue
				SET status = 'failed', completed_at = $1, worker_id = '', claimed_at = NULL, lease_token = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL
				WHERE id = $2 AND status = 'claimed' AND lease_token = $3`, now, item.queueID, item.leaseToken); err != nil {
				return 0, err
			}
			if _, err := tx.Exec(ctx, `
				UPDATE task_runs
				SET status = 'failed', failure_reason = $1, failure_classification = 'terminal', completed_at = $2
				WHERE id = $3 AND status = 'running'`, reason, now, item.taskRunID); err != nil {
				return 0, err
			}
			continue
		}
		if _, err := tx.Exec(ctx, `
			UPDATE task_queue
			SET status = 'queued', worker_id = '', claimed_at = NULL, completed_at = NULL, lease_token = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL, not_before = NULL, created_at = $1
			WHERE id = $2 AND status = 'claimed' AND lease_token = $3`, now, item.queueID, item.leaseToken); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE task_runs
			SET status = 'queued', failure_reason = 'worker_lost'
			WHERE id = $1 AND status = 'running'`, item.taskRunID); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(items), nil
}

func (r *PostgresRepository) Complete(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, attempt int, output json.RawMessage, now time.Time) error {
	return r.finish(ctx, taskRunID, workerID, leaseToken, attempt, "completed", output, "", "", now)
}

func (r *PostgresRepository) Fail(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, attempt int, reason string, now time.Time) error {
	return r.finish(ctx, taskRunID, workerID, leaseToken, attempt, "failed", nil, reason, "terminal", now)
}

// FailClassified records a task failure together with its failure
// classification so retry policy and observability can distinguish transient
// from terminal failures without changing the Fail contract.
func (r *PostgresRepository) FailClassified(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, attempt int, reason, classification string, now time.Time) error {
	return r.finish(ctx, taskRunID, workerID, leaseToken, attempt, "failed", nil, reason, classification, now)
}

func (r *PostgresRepository) finish(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, attempt int, queueStatus string, output json.RawMessage, reason, classification string, now time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if queueStatus == "completed" {
		if err := requireRowsAffected(ctx, tx, `
			UPDATE task_queue
			SET status = 'completed', completed_at = $1
			WHERE task_run_id = $2 AND status = 'claimed' AND worker_id = $3 AND lease_token = $4`, now, taskRunID, workerID, leaseToken); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrLeaseNotOwned
			}
			return err
		}
		if err := requireRowsAffected(ctx, tx, `UPDATE task_runs SET status = 'succeeded', output = $2, completed_at = $3 WHERE id = $1 AND status = 'running'`, taskRunID, output, now); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrLeaseNotOwned
			}
			return err
		}
		if err := requireRowsAffected(ctx, tx, `UPDATE task_attempts SET status = 'succeeded', completed_at = $1 WHERE task_run_id = $2 AND attempt_number = $3 AND worker_id = $4 AND lease_token = $5 AND status = 'running'`, now, taskRunID, attempt, workerID, leaseToken); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrLeaseNotOwned
			}
			return err
		}
	} else {
		// Always record the attempt outcome in append-only history so retries
		// remain visible after a transient failure.
		if err := requireRowsAffected(ctx, tx, `UPDATE task_attempts SET status = 'failed', completed_at = $1, failure_reason = $2, failure_classification = $3 WHERE task_run_id = $4 AND attempt_number = $5 AND worker_id = $6 AND lease_token = $7 AND status = 'running'`, now, reason, classification, taskRunID, attempt, workerID, leaseToken); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrLeaseNotOwned
			}
			return err
		}
		// A transient failure with attempts remaining is scheduled for retry:
		// the queue row and task run return to 'queued' with a delayed backoff
		// so another worker can claim and re-run the task. Terminal failures or
		// exhausted retries mark the task failed.
		if classification == "transient" && attempt < r.maxAttempts {
			retryAt := now.Add(retryBackoff(attempt))
			if err := requireRowsAffected(ctx, tx, `
				UPDATE task_queue
				SET status = 'queued', worker_id = '', claimed_at = NULL, completed_at = NULL,
				    lease_token = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL,
				    not_before = $1, updated_at = $2, created_at = $2
				WHERE task_run_id = $3 AND status = 'claimed' AND worker_id = $4 AND lease_token = $5`,
				retryAt, now, taskRunID, workerID, leaseToken); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return ErrLeaseNotOwned
				}
				return err
			}
			if err := requireRowsAffected(ctx, tx, `UPDATE task_runs SET status = 'queued', failure_reason = $1, completed_at = NULL WHERE id = $2 AND status = 'running'`, reason, taskRunID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return ErrLeaseNotOwned
				}
				return err
			}
		} else {
			if err := requireRowsAffected(ctx, tx, `
				UPDATE task_queue
				SET status = 'failed', completed_at = $1
				WHERE task_run_id = $2 AND status = 'claimed' AND worker_id = $3 AND lease_token = $4`, now, taskRunID, workerID, leaseToken); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return ErrLeaseNotOwned
				}
				return err
			}
			if err := requireRowsAffected(ctx, tx, `UPDATE task_runs SET status = 'failed', failure_reason = $2, failure_classification = $3, completed_at = $4 WHERE id = $1 AND status = 'running'`, taskRunID, reason, classification, now); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return ErrLeaseNotOwned
				}
				return err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

func requireRowsAffected(ctx context.Context, tx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}, query string, args ...any) error {
	tag, err := tx.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *PostgresRepository) QueuedCount(ctx context.Context) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM task_queue WHERE status = 'queued'`).Scan(&count)
	return count, err
}
