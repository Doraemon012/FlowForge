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
	rows, err := r.pool.Query(ctx, `SELECT e.id, e.project_id, e.workflow_id, e.workflow_version_id, e.status, e.input, e.failure_reason, e.created_at, e.started_at, e.completed_at FROM executions e JOIN projects p ON p.id = e.project_id WHERE e.project_id = $1 AND p.owner_id = $2 ORDER BY e.created_at DESC`, projectID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]Execution, 0)
	for rows.Next() {
		var item Execution
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.WorkflowID, &item.WorkflowVersionID, &item.Status, &item.Input, &item.FailureReason, &item.CreatedAt, &item.StartedAt, &item.CompletedAt); err != nil {
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
