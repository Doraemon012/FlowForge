package queue

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/workflow"
)

var ErrNoWork = errors.New("no queued work")

type Work struct {
	QueueID     uuid.UUID
	TaskRunID   uuid.UUID
	ExecutionID uuid.UUID
	Task        workflow.Task
	Input       json.RawMessage
	WorkerID    string
}

type Repository interface {
	Enqueue(ctx context.Context, taskRunID uuid.UUID, now time.Time) error
	Claim(ctx context.Context, workerID string, now time.Time) (Work, error)
	Complete(ctx context.Context, taskRunID uuid.UUID, workerID string, now time.Time) error
	Fail(ctx context.Context, taskRunID uuid.UUID, workerID string, now time.Time) error
	QueuedCount(ctx context.Context) (int, error)
}

type PostgresRepository struct{ pool *pgxpool.Pool }

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
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
	err = tx.QueryRow(ctx, `SELECT id, task_run_id FROM task_queue WHERE status = 'queued' ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&queueID, &taskRunID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Work{}, ErrNoWork
	}
	if err != nil {
		return Work{}, err
	}
	var work Work
	var workTaskID string
	var definition []byte
	err = tx.QueryRow(ctx, `
		SELECT q.id, tr.id, tr.execution_id, tr.task_id, e.input, wv.definition
		FROM task_queue q
		JOIN task_runs tr ON tr.id = q.task_run_id
		JOIN executions e ON e.id = tr.execution_id
		JOIN workflow_versions wv ON wv.id = e.workflow_version_id
		WHERE q.id = $1 AND q.status = 'queued'`, queueID).Scan(&work.QueueID, &work.TaskRunID, &work.ExecutionID, &workTaskID, &work.Input, &definition)
	if err != nil {
		return Work{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE task_queue SET status = 'claimed', worker_id = $1, claimed_at = $2 WHERE id = $3 AND status = 'queued'`, workerID, now, queueID); err != nil {
		return Work{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE task_runs SET status = 'running', started_at = $1 WHERE id = $2 AND status = 'queued'`, now, taskRunID); err != nil {
		return Work{}, err
	}
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
	work.WorkerID = workerID
	return work, nil
}

func (r *PostgresRepository) Complete(ctx context.Context, taskRunID uuid.UUID, workerID string, now time.Time) error {
	return r.finish(ctx, taskRunID, workerID, "completed", now)
}
func (r *PostgresRepository) Fail(ctx context.Context, taskRunID uuid.UUID, workerID string, now time.Time) error {
	return r.finish(ctx, taskRunID, workerID, "failed", now)
}
func (r *PostgresRepository) finish(ctx context.Context, taskRunID uuid.UUID, workerID, status string, now time.Time) error {
	tag, err := r.pool.Exec(ctx, `UPDATE task_queue SET status = $1, completed_at = $2 WHERE task_run_id = $3 AND worker_id = $4 AND status = 'claimed'`, status, now, taskRunID, workerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("queue item is not claimed by worker")
	}
	return nil
}
func (r *PostgresRepository) QueuedCount(ctx context.Context) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM task_queue WHERE status = 'queued'`).Scan(&count)
	return count, err
}
