package execution

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/workflow"
)

type PostgresRepository struct{ pool *pgxpool.Pool }

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) CreateOwned(ctx context.Context, ownerID, workflowID, versionID uuid.UUID, input json.RawMessage, now time.Time) (Execution, error) {
	var execution Execution
	var definition []byte
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Execution{}, err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `SELECT wv.definition FROM workflow_versions wv JOIN workflows w ON w.id = wv.workflow_id JOIN projects p ON p.id = w.project_id WHERE wv.id = $1 AND wv.workflow_id = $2 AND p.owner_id = $3`, versionID, workflowID, ownerID).Scan(&definition)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrVersionInvalid
	}
	if err != nil {
		return Execution{}, err
	}
	var graph workflow.Definition
	if err := json.Unmarshal(definition, &graph); err != nil {
		return Execution{}, ErrVersionInvalid
	}
	if len(workflow.ValidateDefinition(graph)) > 0 {
		return Execution{}, ErrVersionInvalid
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	execution = Execution{ID: uuid.New(), WorkflowID: workflowID, ProjectID: uuid.Nil, WorkflowVersionID: versionID, Status: "pending", Input: input, CreatedAt: now}
	err = tx.QueryRow(ctx, `INSERT INTO executions (id, project_id, workflow_id, workflow_version_id, status, input, created_at) SELECT $1, w.project_id, w.id, $2, 'pending', $3, $4 FROM workflows w JOIN projects p ON p.id = w.project_id WHERE w.id = $5 AND p.owner_id = $6 RETURNING project_id`, execution.ID, versionID, input, now, workflowID, ownerID).Scan(&execution.ProjectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrNotFound
	}
	if err != nil {
		return Execution{}, err
	}
	for _, task := range graph.Tasks {
		if _, err := tx.Exec(ctx, `INSERT INTO task_runs (id, execution_id, task_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)`, uuid.New(), execution.ID, task.ID, now); err != nil {
			return Execution{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Execution{}, err
	}
	return execution, nil
}

// CreateOwnedWithIdempotency creates an execution and atomically reserves its
// idempotency key in the same transaction. If another request already reserved
// the key, this rolls back the execution it was about to create and returns the
// previously created execution instead, preventing duplicate executions under
// concurrent retries with the same Idempotency-Key.
func (r *PostgresRepository) CreateOwnedWithIdempotency(ctx context.Context, ownerID, workflowID, versionID uuid.UUID, input json.RawMessage, now time.Time, projectID uuid.UUID, idempotencyKey string) (Execution, error) {
	if idempotencyKey == "" {
		return r.CreateOwned(ctx, ownerID, workflowID, versionID, input, now)
	}
	var execution Execution
	var definition []byte
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Execution{}, err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `SELECT wv.definition FROM workflow_versions wv JOIN workflows w ON w.id = wv.workflow_id JOIN projects p ON p.id = w.project_id WHERE wv.id = $1 AND wv.workflow_id = $2 AND p.owner_id = $3`, versionID, workflowID, ownerID).Scan(&definition)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrVersionInvalid
	}
	if err != nil {
		return Execution{}, err
	}
	var graph workflow.Definition
	if err := json.Unmarshal(definition, &graph); err != nil {
		return Execution{}, ErrVersionInvalid
	}
	if len(workflow.ValidateDefinition(graph)) > 0 {
		return Execution{}, ErrVersionInvalid
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	execution = Execution{ID: uuid.New(), WorkflowID: workflowID, ProjectID: projectID, WorkflowVersionID: versionID, Status: "pending", Input: input, CreatedAt: now}
	err = tx.QueryRow(ctx, `INSERT INTO executions (id, project_id, workflow_id, workflow_version_id, status, input, created_at) SELECT $1, w.project_id, w.id, $2, 'pending', $3, $4 FROM workflows w JOIN projects p ON p.id = w.project_id WHERE w.id = $5 AND p.owner_id = $6 RETURNING project_id`, execution.ID, versionID, input, now, workflowID, ownerID).Scan(&execution.ProjectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrNotFound
	}
	if err != nil {
		return Execution{}, err
	}
	for _, task := range graph.Tasks {
		if _, err := tx.Exec(ctx, `INSERT INTO task_runs (id, execution_id, task_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)`, uuid.New(), execution.ID, task.ID, now); err != nil {
			return Execution{}, err
		}
	}
	tag, err := tx.Exec(ctx, `INSERT INTO execution_idempotency (idempotency_key, execution_id, project_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key, project_id) DO NOTHING`, idempotencyKey, execution.ID, projectID, now)
	if err != nil {
		return Execution{}, err
	}
	if tag.RowsAffected() == 0 {
		// Another request already reserved this key. Roll back the execution
		// we were creating and return the previously created execution so the
		// client sees a single, stable result for the idempotency key.
		_ = tx.Rollback(ctx)
		var existingID uuid.UUID
		if err := r.pool.QueryRow(ctx, `SELECT execution_id FROM execution_idempotency WHERE idempotency_key = $1 AND project_id = $2`, idempotencyKey, projectID).Scan(&existingID); err != nil {
			return Execution{}, err
		}
		return r.GetOwned(ctx, ownerID, existingID)
	}
	if err := tx.Commit(ctx); err != nil {
		return Execution{}, err
	}
	return execution, nil
}

func (r *PostgresRepository) GetOwned(ctx context.Context, ownerID, executionID uuid.UUID) (Execution, error) {
	var result Execution
	err := r.pool.QueryRow(ctx, `SELECT e.id, e.project_id, e.workflow_id, e.workflow_version_id, e.status, e.input, e.failure_reason, e.created_at, e.started_at, e.completed_at FROM executions e JOIN projects p ON p.id = e.project_id WHERE e.id = $1 AND p.owner_id = $2`, executionID, ownerID).Scan(&result.ID, &result.ProjectID, &result.WorkflowID, &result.WorkflowVersionID, &result.Status, &result.Input, &result.FailureReason, &result.CreatedAt, &result.StartedAt, &result.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrNotFound
	}
	if err != nil {
		return Execution{}, err
	}
	return result, nil
}

func (r *PostgresRepository) ListOwned(ctx context.Context, ownerID, projectID uuid.UUID) ([]Execution, error) {
	// The earliest failed task is folded into each row so the list can offer a
	// direct "fix this task in the builder" link without a per-execution
	// request. The subquery picks the same representative failure as
	// summarizeTaskFailure (earliest by task id); an empty id means no task
	// failed (e.g. "workflow cannot progress") and the caller shows no link.
	rows, err := r.pool.Query(ctx, `SELECT e.id, e.project_id, e.workflow_id, e.workflow_version_id, e.status, e.input, e.failure_reason, COALESCE((SELECT tr.task_id FROM task_runs tr WHERE tr.execution_id = e.id AND tr.status = 'failed' ORDER BY tr.task_id LIMIT 1), '') AS failed_task_id, e.created_at, e.started_at, e.completed_at FROM executions e JOIN projects p ON p.id = e.project_id WHERE e.project_id = $1 AND p.owner_id = $2 ORDER BY e.created_at DESC`, projectID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]Execution, 0)
	for rows.Next() {
		var item Execution
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.WorkflowID, &item.WorkflowVersionID, &item.Status, &item.Input, &item.FailureReason, &item.FailedTaskID, &item.CreatedAt, &item.StartedAt, &item.CompletedAt); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *PostgresRepository) ListActive(ctx context.Context) ([]OwnedExecution, error) {
	rows, err := r.pool.Query(ctx, `SELECT p.owner_id, e.id, e.project_id, e.workflow_id, e.workflow_version_id, e.status, e.input, e.failure_reason, e.created_at, e.started_at, e.completed_at FROM executions e JOIN projects p ON p.id = e.project_id WHERE e.status IN ('pending', 'running') ORDER BY e.created_at, e.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]OwnedExecution, 0)
	for rows.Next() {
		var item OwnedExecution
		if err := rows.Scan(&item.OwnerID, &item.ID, &item.ProjectID, &item.WorkflowID, &item.WorkflowVersionID, &item.Status, &item.Input, &item.FailureReason, &item.CreatedAt, &item.StartedAt, &item.CompletedAt); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *PostgresRepository) ListTaskRunsOwned(ctx context.Context, ownerID, executionID uuid.UUID) ([]TaskRun, error) {
	rows, err := r.pool.Query(ctx, `SELECT tr.id, tr.execution_id, tr.task_id, tr.status, tr.output, tr.failure_reason, tr.created_at, tr.started_at, tr.completed_at FROM task_runs tr JOIN executions e ON e.id = tr.execution_id JOIN projects p ON p.id = e.project_id WHERE tr.execution_id = $1 AND p.owner_id = $2 ORDER BY tr.created_at, tr.task_id`, executionID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]TaskRun, 0)
	for rows.Next() {
		var item TaskRun
		if err := rows.Scan(&item.ID, &item.ExecutionID, &item.TaskID, &item.Status, &item.Output, &item.FailureReason, &item.CreatedAt, &item.StartedAt, &item.CompletedAt); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *PostgresRepository) LoadRun(ctx context.Context, ownerID, executionID uuid.UUID) (Execution, workflow.Definition, []TaskRun, error) {
	execution, err := r.GetOwned(ctx, ownerID, executionID)
	if err != nil {
		return Execution{}, workflow.Definition{}, nil, err
	}
	var definitionBytes []byte
	if err := r.pool.QueryRow(ctx, `SELECT definition FROM workflow_versions WHERE id = $1`, execution.WorkflowVersionID).Scan(&definitionBytes); err != nil {
		return Execution{}, workflow.Definition{}, nil, err
	}
	var definition workflow.Definition
	if err := json.Unmarshal(definitionBytes, &definition); err != nil {
		return Execution{}, workflow.Definition{}, nil, err
	}
	runs, err := r.ListTaskRunsOwned(ctx, ownerID, executionID)
	return execution, definition, runs, err
}

func (r *PostgresRepository) SetExecutionRunning(ctx context.Context, id uuid.UUID, startedAt time.Time) error {
	return transition(ctx, r.pool, `UPDATE executions SET status = 'running', started_at = $2 WHERE id = $1 AND status = 'pending'`, id, startedAt)
}
func (r *PostgresRepository) SetTaskRunning(ctx context.Context, id uuid.UUID, startedAt time.Time) error {
	return transition(ctx, r.pool, `UPDATE task_runs SET status = 'running', started_at = $2 WHERE id = $1 AND status = 'pending'`, id, startedAt)
}
func (r *PostgresRepository) SetTaskSucceeded(ctx context.Context, id uuid.UUID, output json.RawMessage, completedAt time.Time) error {
	return transition(ctx, r.pool, `UPDATE task_runs SET status = 'succeeded', output = $2, completed_at = $3 WHERE id = $1 AND status = 'running'`, id, output, completedAt)
}
func (r *PostgresRepository) SetTaskFailed(ctx context.Context, id uuid.UUID, reason string, completedAt time.Time) error {
	return transition(ctx, r.pool, `UPDATE task_runs SET status = 'failed', failure_reason = $2, completed_at = $3 WHERE id = $1 AND status = 'running'`, id, reason, completedAt)
}
func (r *PostgresRepository) SetTaskBlocked(ctx context.Context, id uuid.UUID, reason string, completedAt time.Time) error {
	return transition(ctx, r.pool, `UPDATE task_runs SET status = 'blocked', failure_reason = $2, completed_at = $3 WHERE id = $1 AND status = 'pending'`, id, reason, completedAt)
}
func (r *PostgresRepository) SetExecutionCompleted(ctx context.Context, id uuid.UUID, completedAt time.Time) error {
	return transition(ctx, r.pool, `UPDATE executions SET status = 'completed', completed_at = $2 WHERE id = $1 AND status = 'running'`, id, completedAt)
}
func (r *PostgresRepository) SetExecutionFailed(ctx context.Context, id uuid.UUID, reason string, completedAt time.Time) error {
	return transition(ctx, r.pool, `UPDATE executions SET status = 'failed', failure_reason = $2, completed_at = $3 WHERE id = $1 AND status = 'running'`, id, reason, completedAt)
}

// CancelOwned stops an owned execution that is still pending or running. It
// runs as a single transaction so an execution can never end up cancelled with
// work still running or queued behind it:
//
//   - every queue row a worker could still act on is cancelled, including a
//     live claim, so an in-flight task loses its lease;
//   - every task run that has not finished (pending, queued, or running) is
//     marked cancelled;
//   - the in-flight attempts are closed;
//   - the execution itself is marked cancelled with completed_at set.
//
// Releasing a live claim is what makes cancellation reach work that is already
// executing: the worker's next heartbeat finds the lease gone, cancels the task
// context, and its late result is rejected by the queue's lease fence - so a
// cancelled run cannot be reopened by the attempt it interrupted.
//
// Cancelling an execution that has already reached a terminal state (completed,
// failed, or already cancelled) is an idempotent no-op that returns the current
// execution - a double-click or a racing worker must not error or reopen it.
func (r *PostgresRepository) CancelOwned(ctx context.Context, ownerID, executionID uuid.UUID, now time.Time) (Execution, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Execution{}, err
	}
	defer tx.Rollback(ctx)

	var current Execution
	err = tx.QueryRow(ctx, `SELECT e.id, e.project_id, e.workflow_id, e.workflow_version_id, e.status, e.input, e.failure_reason, e.created_at, e.started_at, e.completed_at FROM executions e JOIN projects p ON p.id = e.project_id WHERE e.id = $1 AND p.owner_id = $2 FOR UPDATE OF e`, executionID, ownerID).Scan(&current.ID, &current.ProjectID, &current.WorkflowID, &current.WorkflowVersionID, &current.Status, &current.Input, &current.FailureReason, &current.CreatedAt, &current.StartedAt, &current.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrNotFound
	}
	if err != nil {
		return Execution{}, err
	}
	if current.Status != "pending" && current.Status != "running" {
		return current, nil
	}
	// Release every queue row a worker could still act on, including one that
	// is claimed right now. Clearing the claim is deliberate: the worker keeps
	// its task context, notices on the next heartbeat that the lease is gone,
	// and stops. Its eventual result is rejected by the fence below, so the
	// cancelled state cannot be overwritten from underneath.
	if _, err := tx.Exec(ctx, `UPDATE task_queue SET status = 'cancelled', completed_at = $2, worker_id = '', claimed_at = NULL, lease_token = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL WHERE status IN ('queued', 'claimed') AND task_run_id IN (SELECT id FROM task_runs WHERE execution_id = $1)`, executionID, now); err != nil {
		return Execution{}, err
	}
	// Every task run that has not finished is cancelled - including a running
	// one. After the claim above is released the worker can no longer report a
	// result, so leaving it 'running' would be a state that never resolves.
	if _, err := tx.Exec(ctx, `UPDATE task_runs SET status = 'cancelled', completed_at = $2 WHERE execution_id = $1 AND status IN ('pending', 'queued', 'running')`, executionID, now); err != nil {
		return Execution{}, err
	}
	// Close the in-flight attempts too, so history does not keep showing a live
	// attempt for work that was deliberately stopped.
	if _, err := tx.Exec(ctx, `UPDATE task_attempts SET status = 'cancelled', completed_at = $2, failure_reason = 'execution cancelled' WHERE status = 'running' AND task_run_id IN (SELECT id FROM task_runs WHERE execution_id = $1)`, executionID, now); err != nil {
		return Execution{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE executions SET status = 'cancelled', completed_at = $2 WHERE id = $1 AND status IN ('pending', 'running')`, executionID, now); err != nil {
		return Execution{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Execution{}, err
	}
	current.Status = "cancelled"
	current.CompletedAt = &now
	return current, nil
}

func transition(ctx context.Context, pool interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}, query string, args ...any) error {
	tag, err := pool.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("invalid state transition")
	}
	return nil
}
