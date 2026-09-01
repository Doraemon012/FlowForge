package schedule

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("schedule not found")
	ErrConflict = errors.New("schedule already exists for this workflow")
)

type Schedule struct {
	ID              uuid.UUID  `json:"id"`
	ProjectID       uuid.UUID  `json:"project_id"`
	WorkflowID      uuid.UUID  `json:"workflow_id"`
	CronExpression  string     `json:"cron_expression"`
	Timezone        string     `json:"timezone"`
	Enabled         bool       `json:"enabled"`
	NextOccurrence  *time.Time `json:"next_occurrence"`
	LastTriggeredAt *time.Time `json:"last_triggered_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type Repository interface {
	Create(ctx context.Context, schedule Schedule) error
	GetOwned(ctx context.Context, ownerID, projectID, scheduleID uuid.UUID) (Schedule, error)
	GetByWorkflow(ctx context.Context, projectID, workflowID uuid.UUID) (Schedule, error)
	ListOwned(ctx context.Context, ownerID, projectID uuid.UUID) ([]Schedule, error)
	UpdateOwned(ctx context.Context, ownerID, projectID, scheduleID uuid.UUID, cron, tz string, enabled bool, updatedAt time.Time) (Schedule, error)
	DeleteOwned(ctx context.Context, ownerID, projectID, scheduleID uuid.UUID) error
	FindDueSchedules(ctx context.Context, now time.Time) ([]Schedule, error)
	MarkTriggered(ctx context.Context, scheduleID uuid.UUID, now time.Time) error
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) Create(ctx context.Context, schedule Schedule) error {
	if schedule.ID == uuid.Nil || schedule.ProjectID == uuid.Nil || schedule.WorkflowID == uuid.Nil {
		return errors.New("schedule, project, and workflow IDs are required")
	}
	if schedule.CronExpression == "" {
		return errors.New("cron expression is required")
	}
	if schedule.Timezone == "" {
		schedule.Timezone = "UTC"
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO schedules (id, project_id, workflow_id, cron_expression, timezone, enabled, next_occurrence, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, schedule.ID, schedule.ProjectID, schedule.WorkflowID, schedule.CronExpression, schedule.Timezone, schedule.Enabled, schedule.NextOccurrence, schedule.CreatedAt, schedule.UpdatedAt)

	if err != nil && err.Error() == "ERROR: duplicate key value violates unique constraint \"schedules_project_workflow_unique\" (SQLSTATE 23505)" {
		return ErrConflict
	}
	return err
}

func (r *PostgresRepository) GetOwned(ctx context.Context, ownerID, projectID, scheduleID uuid.UUID) (Schedule, error) {
	var result Schedule
	err := r.pool.QueryRow(ctx, `
		SELECT s.id, s.project_id, s.workflow_id, s.cron_expression, s.timezone, s.enabled, s.next_occurrence, s.last_triggered_at, s.created_at, s.updated_at
		FROM schedules s
		JOIN workflows w ON s.workflow_id = w.id
		WHERE s.id = $1 AND s.project_id = $2 AND w.project_id = $2
	`, scheduleID, projectID).Scan(
		&result.ID, &result.ProjectID, &result.WorkflowID, &result.CronExpression, &result.Timezone, &result.Enabled,
		&result.NextOccurrence, &result.LastTriggeredAt, &result.CreatedAt, &result.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Schedule{}, ErrNotFound
	}
	return result, err
}

func (r *PostgresRepository) GetByWorkflow(ctx context.Context, projectID, workflowID uuid.UUID) (Schedule, error) {
	var result Schedule
	err := r.pool.QueryRow(ctx, `
		SELECT id, project_id, workflow_id, cron_expression, timezone, enabled, next_occurrence, last_triggered_at, created_at, updated_at
		FROM schedules
		WHERE project_id = $1 AND workflow_id = $2
	`, projectID, workflowID).Scan(
		&result.ID, &result.ProjectID, &result.WorkflowID, &result.CronExpression, &result.Timezone, &result.Enabled,
		&result.NextOccurrence, &result.LastTriggeredAt, &result.CreatedAt, &result.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Schedule{}, ErrNotFound
	}
	return result, err
}

func (r *PostgresRepository) ListOwned(ctx context.Context, ownerID, projectID uuid.UUID) ([]Schedule, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT s.id, s.project_id, s.workflow_id, s.cron_expression, s.timezone, s.enabled, s.next_occurrence, s.last_triggered_at, s.created_at, s.updated_at
		FROM schedules s
		JOIN workflows w ON s.workflow_id = w.id
		WHERE s.project_id = $1 AND w.project_id = $1
		ORDER BY s.created_at, s.id
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	schedules := make([]Schedule, 0)
	for rows.Next() {
		var result Schedule
		if err := rows.Scan(
			&result.ID, &result.ProjectID, &result.WorkflowID, &result.CronExpression, &result.Timezone, &result.Enabled,
			&result.NextOccurrence, &result.LastTriggeredAt, &result.CreatedAt, &result.UpdatedAt,
		); err != nil {
			return nil, err
		}
		schedules = append(schedules, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return schedules, nil
}

func (r *PostgresRepository) UpdateOwned(ctx context.Context, ownerID, projectID, scheduleID uuid.UUID, cron, tz string, enabled bool, updatedAt time.Time) (Schedule, error) {
	if cron == "" {
		return Schedule{}, errors.New("cron expression is required")
	}
	if tz == "" {
		tz = "UTC"
	}

	var result Schedule
	err := r.pool.QueryRow(ctx, `
		UPDATE schedules SET cron_expression = $1, timezone = $2, enabled = $3, updated_at = $4
		WHERE id = $5 AND project_id = $6
		RETURNING id, project_id, workflow_id, cron_expression, timezone, enabled, next_occurrence, last_triggered_at, created_at, updated_at
	`, cron, tz, enabled, updatedAt, scheduleID, projectID).Scan(
		&result.ID, &result.ProjectID, &result.WorkflowID, &result.CronExpression, &result.Timezone, &result.Enabled,
		&result.NextOccurrence, &result.LastTriggeredAt, &result.CreatedAt, &result.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Schedule{}, ErrNotFound
	}
	return result, err
}

func (r *PostgresRepository) DeleteOwned(ctx context.Context, ownerID, projectID, scheduleID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM schedules WHERE id = $1 AND project_id = $2
	`, scheduleID, projectID)
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (r *PostgresRepository) FindDueSchedules(ctx context.Context, now time.Time) ([]Schedule, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, project_id, workflow_id, cron_expression, timezone, enabled, next_occurrence, last_triggered_at, created_at, updated_at
		FROM schedules
		WHERE enabled = true AND next_occurrence IS NOT NULL AND next_occurrence <= $1
		ORDER BY next_occurrence, id
	`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	schedules := make([]Schedule, 0)
	for rows.Next() {
		var result Schedule
		if err := rows.Scan(
			&result.ID, &result.ProjectID, &result.WorkflowID, &result.CronExpression, &result.Timezone, &result.Enabled,
			&result.NextOccurrence, &result.LastTriggeredAt, &result.CreatedAt, &result.UpdatedAt,
		); err != nil {
			return nil, err
		}
		schedules = append(schedules, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return schedules, nil
}

func (r *PostgresRepository) MarkTriggered(ctx context.Context, scheduleID uuid.UUID, now time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE schedules SET last_triggered_at = $1, updated_at = $1 WHERE id = $2
	`, now, scheduleID)
	return err
}
