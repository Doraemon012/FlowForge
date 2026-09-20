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

// executableDefinition resolves the published definition a new execution will
// run, and is the single authoritative gate on starting work.
//
// Every trigger - a manual run, a scheduler tick, a webhook delivery - funnels
// through CreateOwned or CreateOwnedWithIdempotency, and both call this. It
// refuses to hand back a definition when the owning project is no longer
// active, so an archived (deleted) project cannot start a run no matter which
// trigger fires or which handler forgot to check.
//
// The project row is locked FOR SHARE rather than merely read. A plain read
// would leave a window in which the project is archived between the check and
// the execution insert, because the archive runs in its own transaction. The
// share lock makes the two serialize: whichever commits first wins, and if the
// archive wins this returns ErrProjectArchived instead of creating a run inside
// a deleted project.
func executableDefinition(ctx context.Context, tx pgx.Tx, ownerID, workflowID, versionID uuid.UUID) (workflow.Definition, error) {
	var definition []byte
	var projectStatus string
	err := tx.QueryRow(ctx, `
		SELECT wv.definition, p.status
		FROM workflow_versions wv
		JOIN workflows w ON w.id = wv.workflow_id
		JOIN projects p ON p.id = w.project_id
		WHERE wv.id = $1 AND wv.workflow_id = $2 AND p.owner_id = $3
		FOR SHARE OF p`, versionID, workflowID, ownerID).Scan(&definition, &projectStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return workflow.Definition{}, ErrVersionInvalid
	}
	if err != nil {
		return workflow.Definition{}, err
	}
	if projectStatus != "active" {
		return workflow.Definition{}, ErrProjectArchived
	}
	var graph workflow.Definition
	if err := json.Unmarshal(definition, &graph); err != nil {
		return workflow.Definition{}, ErrVersionInvalid
	}
	if len(workflow.ValidateDefinition(graph)) > 0 {
		return workflow.Definition{}, ErrVersionInvalid
	}
	return graph, nil
}

func (r *PostgresRepository) CreateOwned(ctx context.Context, ownerID, workflowID, versionID uuid.UUID, input json.RawMessage, now time.Time) (Execution, error) {
	var execution Execution
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Execution{}, err
	}
	defer tx.Rollback(ctx)
	graph, err := executableDefinition(ctx, tx, ownerID, workflowID, versionID)
	if err != nil {
		return Execution{}, err
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	execution = Execution{ID: uuid.New(), WorkflowID: workflowID, ProjectID: uuid.Nil, WorkflowVersionID: versionID, Status: "pending", Input: input, CreatedAt: now}
	err = tx.QueryRow(ctx, `INSERT INTO executions (id, project_id, workflow_id, workflow_version_id, status, input, created_at) SELECT $1, w.project_id, w.id, $2, 'pending', $3, $4 FROM workflows w JOIN projects p ON p.id = w.project_id WHERE w.id = $5 AND p.owner_id = $6 AND p.status = 'active' RETURNING project_id`, execution.ID, versionID, input, now, workflowID, ownerID).Scan(&execution.ProjectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrProjectArchived
	}
	if err != nil {
		return Execution{}, err
	}
	if err := insertTaskRuns(ctx, tx, execution.ID, graph, now); err != nil {
		return Execution{}, err
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
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Execution{}, err
	}
	defer tx.Rollback(ctx)
	graph, err := executableDefinition(ctx, tx, ownerID, workflowID, versionID)
	if err != nil {
		return Execution{}, err
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	execution = Execution{ID: uuid.New(), WorkflowID: workflowID, ProjectID: projectID, WorkflowVersionID: versionID, Status: "pending", Input: input, CreatedAt: now}
	err = tx.QueryRow(ctx, `INSERT INTO executions (id, project_id, workflow_id, workflow_version_id, status, input, created_at) SELECT $1, w.project_id, w.id, $2, 'pending', $3, $4 FROM workflows w JOIN projects p ON p.id = w.project_id WHERE w.id = $5 AND p.owner_id = $6 AND p.status = 'active' RETURNING project_id`, execution.ID, versionID, input, now, workflowID, ownerID).Scan(&execution.ProjectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Execution{}, ErrProjectArchived
	}
	if err != nil {
		return Execution{}, err
	}
	if err := insertTaskRuns(ctx, tx, execution.ID, graph, now); err != nil {
		return Execution{}, err
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

// insertTaskRuns materializes the pending task runs for a new execution, one
// per task in the published definition.
func insertTaskRuns(ctx context.Context, tx pgx.Tx, executionID uuid.UUID, graph workflow.Definition, now time.Time) error {
	for _, task := range graph.Tasks {
		if _, err := tx.Exec(ctx, `INSERT INTO task_runs (id, execution_id, task_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)`, uuid.New(), executionID, task.ID, now); err != nil {
			return err
		}
	}
	return nil
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

// ListActive reports the executions the control plane must resume on start.
//
// Only executions of active projects are returned. Resuming is itself an
// execution path: the engine re-drives the run and its worker makes outbound
// calls, so an execution left pending/running inside an archived project - by a
// delete that crashed before it could stop live work, or by data written before
// that cancellation existed - must not be picked up and carried further.
func (r *PostgresRepository) ListActive(ctx context.Context) ([]OwnedExecution, error) {
	rows, err := r.pool.Query(ctx, `SELECT p.owner_id, e.id, e.project_id, e.workflow_id, e.workflow_version_id, e.status, e.input, e.failure_reason, e.created_at, e.started_at, e.completed_at FROM executions e JOIN projects p ON p.id = e.project_id WHERE e.status IN ('pending', 'running') AND p.status = 'active' ORDER BY e.created_at, e.id`)
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
	if err := stopLiveWork(ctx, tx, liveExecutionScope, current.ProjectID, now); err != nil {
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

// CancelLiveByProject stops every execution of a project that has not reached a
// terminal state, and reports how many were stopped.
//
// Archiving retires a project, and retiring it must not leave work running. An
// execution that was already orchestrating - or a queued task whose worker is
// holding a lease - would otherwise keep making outbound HTTP calls, sending
// email and writing history for a project the owner has deleted. This runs
// immediately after the archive transition, so the only executions it can find
// are ones that started legitimately before the delete, and it stops them with
// the same release as CancelOwned.
func (r *PostgresRepository) CancelLiveByProject(ctx context.Context, ownerID, projectID uuid.UUID, now time.Time) (int, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// Ownership is asserted against the project rather than the executions:
	// this runs after the project has been archived, so the check must not
	// require the project to still be active.
	var lockedProjectID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT p.id FROM projects p WHERE p.id = $1 AND p.owner_id = $2 FOR UPDATE`, projectID, ownerID).Scan(&lockedProjectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}

	rows, err := tx.Query(ctx, `SELECT id FROM executions WHERE project_id = $1 AND status IN ('pending', 'running') FOR UPDATE`, projectID)
	if err != nil {
		return 0, err
	}
	executionIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		executionIDs = append(executionIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(executionIDs) == 0 {
		return 0, tx.Commit(ctx)
	}
	if err := stopLiveWork(ctx, tx, liveExecutionScope, projectID, now); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `UPDATE executions SET status = 'cancelled', completed_at = $2 WHERE project_id = $1 AND status IN ('pending', 'running')`, projectID, now); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(executionIDs), nil
}

// liveExecutionScope selects the executions that are not finished yet, matched
// by project. Every column is qualified with the executions alias e because
// stopLiveWork runs these predicates inside subqueries of statements that
// update task_queue, task_runs and task_attempts - all of which also have a
// status column, so an unqualified name would be ambiguous to Postgres.
const liveExecutionScope = "e.project_id = $2 AND e.status IN ('pending', 'running')"

// stopLiveWork releases everything a worker could still act on for the
// executions matched by scope, where scope is a SQL predicate over the
// executions table aliased as e. It is the shared body of both cancellation
// paths, so single-execution and whole-project cancellation can never drift
// apart in which rows they stop.
//
// Clearing a live claim is deliberate: the worker keeps its task context,
// notices on the next heartbeat that the lease is gone, and stops. Its eventual
// result is then rejected by the queue's lease fence, so a cancelled state
// cannot be overwritten from underneath.
func stopLiveWork(ctx context.Context, tx pgx.Tx, scope string, scopeArgument any, now time.Time) error {
	queueQuery := `UPDATE task_queue SET status = 'cancelled', completed_at = $1, worker_id = '', claimed_at = NULL, lease_token = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL WHERE status IN ('queued', 'claimed') AND task_run_id IN (SELECT tr.id FROM task_runs tr JOIN executions e ON e.id = tr.execution_id WHERE ` + scope + `)`
	if _, err := tx.Exec(ctx, queueQuery, now, scopeArgument); err != nil {
		return err
	}
	// Every task run that has not finished is cancelled - including a running
	// one. After the claim above is released the worker can no longer report a
	// result, so leaving it 'running' would be a state that never resolves.
	taskRunQuery := `UPDATE task_runs SET status = 'cancelled', completed_at = $1 WHERE status IN ('pending', 'queued', 'running') AND execution_id IN (SELECT e.id FROM executions e WHERE ` + scope + `)`
	if _, err := tx.Exec(ctx, taskRunQuery, now, scopeArgument); err != nil {
		return err
	}
	// Close the in-flight attempts too, so history does not keep showing a live
	// attempt for work that was deliberately stopped.
	attemptQuery := `UPDATE task_attempts SET status = 'cancelled', completed_at = $1, failure_reason = 'execution cancelled' WHERE status = 'running' AND task_run_id IN (SELECT tr.id FROM task_runs tr JOIN executions e ON e.id = tr.execution_id WHERE ` + scope + `)`
	if _, err := tx.Exec(ctx, attemptQuery, now, scopeArgument); err != nil {
		return err
	}
	return nil
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
