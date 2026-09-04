package schedule

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
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
	SetNextOccurrence(ctx context.Context, scheduleID uuid.UUID, nextOccurrence *time.Time, updatedAt time.Time) error
	// AdvanceOccurrence moves next_occurrence to nextOccurrence only when the
	// schedule still points at processedOccurrence. It returns true when the
	// row was updated, and false when another concurrent tick already advanced
	// the schedule, so overlapping scheduler instances cannot double-skip a
	// cadence while processing the same due occurrence.
	AdvanceOccurrence(ctx context.Context, scheduleID uuid.UUID, processedOccurrence, nextOccurrence time.Time, updatedAt time.Time) (bool, error)
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

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
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
		JOIN projects p ON p.id = w.project_id
		WHERE s.id = $1 AND s.project_id = $2 AND p.owner_id = $3
	`, scheduleID, projectID, ownerID).Scan(
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
		JOIN projects p ON p.id = w.project_id
		WHERE s.project_id = $1 AND p.owner_id = $2
		ORDER BY s.created_at, s.id
	`, projectID, ownerID)
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
		WHERE id = $5 AND project_id = $6 AND EXISTS (
			SELECT 1 FROM workflows w JOIN projects p ON p.id = w.project_id
			WHERE w.id = schedules.workflow_id AND p.owner_id = $7
		)
		RETURNING id, project_id, workflow_id, cron_expression, timezone, enabled, next_occurrence, last_triggered_at, created_at, updated_at
	`, cron, tz, enabled, updatedAt, scheduleID, projectID, ownerID).Scan(
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
		DELETE FROM schedules WHERE id = $1 AND project_id = $2 AND EXISTS (
			SELECT 1 FROM workflows w JOIN projects p ON p.id = w.project_id
			WHERE w.id = schedules.workflow_id AND p.owner_id = $3
		)
	`, scheduleID, projectID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
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

func (r *PostgresRepository) SetNextOccurrence(ctx context.Context, scheduleID uuid.UUID, nextOccurrence *time.Time, updatedAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE schedules SET next_occurrence = $1, updated_at = $2 WHERE id = $3
	`, nextOccurrence, updatedAt, scheduleID)
	return err
}

func (r *PostgresRepository) AdvanceOccurrence(ctx context.Context, scheduleID uuid.UUID, processedOccurrence, nextOccurrence time.Time, updatedAt time.Time) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE schedules
		SET next_occurrence = $1, updated_at = $2
		WHERE id = $3 AND next_occurrence = $4
	`, nextOccurrence, updatedAt, scheduleID, processedOccurrence)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ComputeNextOccurrence returns the next future occurrence of the cron
// expression in the given timezone, strictly after the reference time.
func ComputeNextOccurrence(cronExpr, timezone string, after time.Time) (time.Time, error) {
	if timezone == "" {
		timezone = "UTC"
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	cronSchedule, err := cron.ParseStandard(cronExpr)
	if err != nil {
		return time.Time{}, err
	}
	return cronSchedule.Next(after.In(loc)), nil
}
