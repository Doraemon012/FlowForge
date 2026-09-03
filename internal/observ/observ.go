package observ

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Event is an append-only domain lifecycle event. It carries the correlation
// identifiers needed to locate a failure in time and space.
type Event struct {
	ID            uuid.UUID       `json:"id"`
	ProjectID     uuid.UUID       `json:"project_id"`
	ExecutionID   uuid.UUID       `json:"execution_id"`
	TaskID        string          `json:"task_id,omitempty"`
	TaskRunID     *uuid.UUID      `json:"task_run_id,omitempty"`
	TaskAttemptID *uuid.UUID      `json:"task_attempt_id,omitempty"`
	WorkerID      string          `json:"worker_id,omitempty"`
	EventType     string          `json:"event_type"`
	CreatedAt     time.Time       `json:"created_at"`
	Metadata      json.RawMessage `json:"metadata"`
}

// LogEntry is a persisted structured log record sharing the correlation
// identifiers with the lifecycle event history. Credential values and raw
// payloads must never be written here; callers redact before storing.
type LogEntry struct {
	ID            uuid.UUID  `json:"id"`
	ProjectID     uuid.UUID  `json:"project_id"`
	ExecutionID   uuid.UUID  `json:"execution_id"`
	TaskID        string     `json:"task_id,omitempty"`
	TaskRunID     *uuid.UUID `json:"task_run_id,omitempty"`
	TaskAttemptID *uuid.UUID `json:"task_attempt_id,omitempty"`
	WorkerID      string     `json:"worker_id,omitempty"`
	Severity      string     `json:"severity"`
	Source        string     `json:"source"`
	Message       string     `json:"message"`
	CreatedAt     time.Time  `json:"created_at"`
}

// Recorder appends domain events. Implementations must be safe to call from
// concurrent goroutines; a nil or Noop recorder disables event history.
type Recorder interface {
	Record(ctx context.Context, event Event) error
}

// LogRecorder appends structured log entries. A nil recorder disables log
// persistence without affecting the stdout structured log stream.
type LogRecorder interface {
	RecordLog(ctx context.Context, entry LogEntry) error
}

// PostgresRecorder persists execution events.
type PostgresRecorder struct {
	pool *pgxpool.Pool
}

// NewPostgresRecorder creates a Postgres-backed event recorder.
func NewPostgresRecorder(pool *pgxpool.Pool) *PostgresRecorder {
	return &PostgresRecorder{pool: pool}
}

// Record appends an event to the execution_events table.
func (r *PostgresRecorder) Record(ctx context.Context, event Event) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if len(event.Metadata) == 0 {
		event.Metadata = json.RawMessage(`{}`)
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO execution_events (id, project_id, execution_id, task_id, task_run_id, task_attempt_id, worker_id, event_type, created_at, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, event.ID, event.ProjectID, event.ExecutionID, event.TaskID, event.TaskRunID, event.TaskAttemptID, event.WorkerID, event.EventType, event.CreatedAt, event.Metadata)
	return err
}

// RecordLog appends a structured log entry to the log_entries table.
func (r *PostgresRecorder) RecordLog(ctx context.Context, entry LogEntry) error {
	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	if entry.Severity == "" {
		entry.Severity = "info"
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO log_entries (id, project_id, execution_id, task_id, task_run_id, task_attempt_id, worker_id, severity, source, message, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, entry.ID, entry.ProjectID, entry.ExecutionID, entry.TaskID, entry.TaskRunID, entry.TaskAttemptID, entry.WorkerID, entry.Severity, entry.Source, entry.Message, entry.CreatedAt)
	return err
}

// Repository is the read-side interface for the observability views.
type Repository interface {
	Recorder
	LogRecorder
	ListEvents(ctx context.Context, ownerID, executionID uuid.UUID) ([]Event, error)
	ListLogs(ctx context.Context, ownerID, executionID uuid.UUID) ([]LogEntry, error)
	ListAttempts(ctx context.Context, ownerID, executionID uuid.UUID) ([]TaskAttempt, error)
	ListWorkers(ctx context.Context) ([]WorkerView, error)
	QueueView(ctx context.Context) (QueueView, error)
	Metrics(ctx context.Context) (Metrics, error)
}

// TaskAttempt is the append-only attempt history for a task run.
type TaskAttempt struct {
	ID                    uuid.UUID  `json:"id"`
	TaskRunID             uuid.UUID  `json:"task_run_id"`
	ExecutionID           uuid.UUID  `json:"execution_id"`
	TaskID                string     `json:"task_id"`
	AttemptNumber         int        `json:"attempt_number"`
	WorkerID              string     `json:"worker_id"`
	Status                string     `json:"status"`
	FailureReason         string     `json:"failure_reason,omitempty"`
	FailureClassification string     `json:"failure_classification,omitempty"`
	StartedAt             time.Time  `json:"started_at"`
	HeartbeatAt           time.Time  `json:"heartbeat_at"`
	LeaseExpiresAt        time.Time  `json:"lease_expires_at"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
}

// WorkerView summarizes a worker's active work and last heartbeat.
type WorkerView struct {
	WorkerID        string     `json:"worker_id"`
	ActiveAttempts  int        `json:"active_attempts"`
	LastHeartbeatAt *time.Time `json:"last_heartbeat_at,omitempty"`
	LastTaskRunID   *uuid.UUID `json:"last_task_run_id,omitempty"`
	LastExecutionID *uuid.UUID `json:"last_execution_id,omitempty"`
}

// QueueView reports durable queue and lease health.
type QueueView struct {
	Queued                 int        `json:"queued"`
	Claimed                int        `json:"claimed"`
	Failed                 int        `json:"failed"`
	Completed              int        `json:"completed"`
	ActiveLeases           int        `json:"active_leases"`
	RetryBacklog           int        `json:"retry_backlog"`
	OldestQueuedAt         *time.Time `json:"oldest_queued_at,omitempty"`
	OldestClaimedExpiresAt *time.Time `json:"oldest_claimed_expires_at,omitempty"`
}

// Metrics is an aggregate operational health view aggregated from persisted
// state. Labels are bounded categories; no raw payload or secret appears here.
type Metrics struct {
	Executions ExecutionMetrics `json:"executions"`
	TaskRuns   TaskMetrics      `json:"task_runs"`
	Attempts   AttemptMetrics   `json:"attempts"`
	Queue      QueueMetrics     `json:"queue"`
	Workers    WorkerMetrics    `json:"workers"`
	Database   DatabaseMetrics  `json:"database"`
}

// ExecutionMetrics counts executions by terminal lifecycle state.
type ExecutionMetrics struct {
	Total     int `json:"total"`
	Pending   int `json:"pending"`
	Running   int `json:"running"`
	Completed int `json:"completed"`
	Failed    int `json:"failed"`
}

// TaskMetrics counts task runs by state.
type TaskMetrics struct {
	Total     int `json:"total"`
	Pending   int `json:"pending"`
	Queued    int `json:"queued"`
	Running   int `json:"running"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
	Blocked   int `json:"blocked"`
}

// AttemptMetrics counts attempts and failure classes.
type AttemptMetrics struct {
	Total      int `json:"total"`
	Succeeded  int `json:"succeeded"`
	Failed     int `json:"failed"`
	WorkerLost int `json:"worker_lost"`
	Transient  int `json:"transient_failures"`
	Terminal   int `json:"terminal_failures"`
	Retries    int `json:"retries"`
}

// QueueMetrics is the queue portion of the aggregate metrics view.
type QueueMetrics struct {
	Queued         int        `json:"queued"`
	Claimed        int        `json:"claimed"`
	Completed      int        `json:"completed"`
	Failed         int        `json:"failed"`
	ActiveLeases   int        `json:"active_leases"`
	RetryBacklog   int        `json:"retry_backlog"`
	OldestQueuedAt *time.Time `json:"oldest_queued_at,omitempty"`
}

// WorkerMetrics counts active workers.
type WorkerMetrics struct {
	ActiveWorkers int `json:"active_workers"`
}

// DatabaseMetrics reports the dependency health probe.
type DatabaseMetrics struct {
	Healthy bool `json:"healthy"`
}

// PostgresRepository implements the read-side views and all recorders.
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a Postgres-backed observability repository.
func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// NoopRecorder discards events and log entries.
type NoopRecorder struct{}

// Record discards the event.
func (NoopRecorder) Record(ctx context.Context, event Event) error { return nil }

// RecordLog discards the log entry.
func (NoopRecorder) RecordLog(ctx context.Context, entry LogEntry) error { return nil }

// Ensure Recorder and Repository are both satisfied by PostgresRepository.
var _ Recorder = (*PostgresRepository)(nil)
var _ LogRecorder = (*PostgresRepository)(nil)
var _ Repository = (*PostgresRepository)(nil)

// Record appends an execution event.
func (r *PostgresRepository) Record(ctx context.Context, event Event) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if len(event.Metadata) == 0 {
		event.Metadata = json.RawMessage(`{}`)
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO execution_events (id, project_id, execution_id, task_id, task_run_id, task_attempt_id, worker_id, event_type, created_at, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, event.ID, event.ProjectID, event.ExecutionID, event.TaskID, event.TaskRunID, event.TaskAttemptID, event.WorkerID, event.EventType, event.CreatedAt, event.Metadata)
	return err
}

// RecordLog appends a structured log entry.
func (r *PostgresRepository) RecordLog(ctx context.Context, entry LogEntry) error {
	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	if entry.Severity == "" {
		entry.Severity = "info"
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO log_entries (id, project_id, execution_id, task_id, task_run_id, task_attempt_id, worker_id, severity, source, message, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, entry.ID, entry.ProjectID, entry.ExecutionID, entry.TaskID, entry.TaskRunID, entry.TaskAttemptID, entry.WorkerID, entry.Severity, entry.Source, entry.Message, entry.CreatedAt)
	return err
}

// ListEvents returns the event history for an owned execution.
func (r *PostgresRepository) ListEvents(ctx context.Context, ownerID, executionID uuid.UUID) ([]Event, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT e.id, e.project_id, e.execution_id, e.task_id, e.task_run_id, e.task_attempt_id, e.worker_id, e.event_type, e.created_at, e.metadata
		FROM execution_events e
		JOIN executions x ON x.id = e.execution_id
		JOIN projects p ON p.id = x.project_id
		WHERE e.execution_id = $1 AND p.owner_id = $2
		ORDER BY e.created_at, e.id
	`, executionID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]Event, 0)
	for rows.Next() {
		var event Event
		if err := rows.Scan(&event.ID, &event.ProjectID, &event.ExecutionID, &event.TaskID, &event.TaskRunID, &event.TaskAttemptID, &event.WorkerID, &event.EventType, &event.CreatedAt, &event.Metadata); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

// ListLogs returns the persisted structured log history for an owned execution.
func (r *PostgresRepository) ListLogs(ctx context.Context, ownerID, executionID uuid.UUID) ([]LogEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT l.id, l.project_id, l.execution_id, l.task_id, l.task_run_id, l.task_attempt_id, l.worker_id, l.severity, l.source, l.message, l.created_at
		FROM log_entries l
		JOIN executions x ON x.id = l.execution_id
		JOIN projects p ON p.id = x.project_id
		WHERE l.execution_id = $1 AND p.owner_id = $2
		ORDER BY l.created_at, l.id
	`, executionID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]LogEntry, 0)
	for rows.Next() {
		var entry LogEntry
		if err := rows.Scan(&entry.ID, &entry.ProjectID, &entry.ExecutionID, &entry.TaskID, &entry.TaskRunID, &entry.TaskAttemptID, &entry.WorkerID, &entry.Severity, &entry.Source, &entry.Message, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

// ListAttempts returns the append-only attempt history for an owned execution.
func (r *PostgresRepository) ListAttempts(ctx context.Context, ownerID, executionID uuid.UUID) ([]TaskAttempt, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT a.id, a.task_run_id, e.id, tr.task_id, a.attempt_number, a.worker_id, a.status,
		       a.failure_reason, a.failure_classification, a.started_at, a.heartbeat_at, a.lease_expires_at, a.completed_at
		FROM task_attempts a
		JOIN task_runs tr ON tr.id = a.task_run_id
		JOIN executions e ON e.id = tr.execution_id
		JOIN projects p ON p.id = e.project_id
		WHERE e.id = $1 AND p.owner_id = $2
		ORDER BY e.created_at, tr.task_id, a.attempt_number
	`, executionID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	attempts := make([]TaskAttempt, 0)
	for rows.Next() {
		var attempt TaskAttempt
		if err := rows.Scan(&attempt.ID, &attempt.TaskRunID, &attempt.ExecutionID, &attempt.TaskID, &attempt.AttemptNumber, &attempt.WorkerID, &attempt.Status, &attempt.FailureReason, &attempt.FailureClassification, &attempt.StartedAt, &attempt.HeartbeatAt, &attempt.LeaseExpiresAt, &attempt.CompletedAt); err != nil {
			return nil, err
		}
		attempts = append(attempts, attempt)
	}
	return attempts, rows.Err()
}

// ListWorkers derives a worker activity view from the durable queue.
func (r *PostgresRepository) ListWorkers(ctx context.Context) ([]WorkerView, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT worker_id, COUNT(*) AS active_attempts, MAX(last_heartbeat_at) AS last_heartbeat_at,
		       (ARRAY_AGG(task_run_id ORDER BY last_heartbeat_at DESC NULLS LAST))[1] AS last_task_run_id,
		       (SELECT tr.execution_id FROM task_runs tr WHERE tr.id = (ARRAY_AGG(q.task_run_id ORDER BY q.last_heartbeat_at DESC NULLS LAST))[1]) AS last_execution_id
		FROM task_queue q
		WHERE status = 'claimed' AND worker_id <> ''
		GROUP BY worker_id
		ORDER BY worker_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	views := make([]WorkerView, 0)
	for rows.Next() {
		var view WorkerView
		if err := rows.Scan(&view.WorkerID, &view.ActiveAttempts, &view.LastHeartbeatAt, &view.LastTaskRunID, &view.LastExecutionID); err != nil {
			return nil, err
		}
		views = append(views, view)
	}
	return views, rows.Err()
}

// QueueView reports queue and lease health.
func (r *PostgresRepository) QueueView(ctx context.Context) (QueueView, error) {
	var view QueueView
	err := r.pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'claimed' AND lease_expires_at IS NOT NULL THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'queued' AND attempt_number > 0 THEN 1 ELSE 0 END), 0),
			MIN(created_at) FILTER (WHERE status = 'queued'),
			MIN(lease_expires_at) FILTER (WHERE status = 'claimed' AND lease_expires_at IS NOT NULL)
		FROM task_queue
	`).Scan(&view.Queued, &view.Claimed, &view.Failed, &view.Completed, &view.ActiveLeases, &view.RetryBacklog, &view.OldestQueuedAt, &view.OldestClaimedExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return view, nil
	}
	return view, err
}

// Metrics aggregates operational counters from persisted state.
func (r *PostgresRepository) Metrics(ctx context.Context) (Metrics, error) {
	var result Metrics

	if err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)
		FROM executions
	`).Scan(&result.Executions.Total, &result.Executions.Pending, &result.Executions.Running, &result.Executions.Completed, &result.Executions.Failed); err != nil {
		return result, err
	}

	if err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END), 0)
		FROM task_runs
	`).Scan(&result.TaskRuns.Total, &result.TaskRuns.Pending, &result.TaskRuns.Queued, &result.TaskRuns.Running, &result.TaskRuns.Succeeded, &result.TaskRuns.Failed, &result.TaskRuns.Blocked); err != nil {
		return result, err
	}

	if err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'worker_lost' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN failure_classification = 'transient' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN failure_classification = 'terminal' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN attempt_number > 1 THEN 1 ELSE 0 END), 0)
		FROM task_attempts
	`).Scan(&result.Attempts.Total, &result.Attempts.Succeeded, &result.Attempts.Failed, &result.Attempts.WorkerLost, &result.Attempts.Transient, &result.Attempts.Terminal, &result.Attempts.Retries); err != nil {
		return result, err
	}

	queueView, err := r.QueueView(ctx)
	if err != nil {
		return result, err
	}
	result.Queue = QueueMetrics{
		Queued:         queueView.Queued,
		Claimed:        queueView.Claimed,
		Completed:      queueView.Completed,
		Failed:         queueView.Failed,
		ActiveLeases:   queueView.ActiveLeases,
		RetryBacklog:   queueView.RetryBacklog,
		OldestQueuedAt: queueView.OldestQueuedAt,
	}

	var activeWorkers int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(DISTINCT worker_id) FROM task_queue WHERE status = 'claimed' AND worker_id <> ''`).Scan(&activeWorkers); err != nil {
		return result, err
	}
	result.Workers.ActiveWorkers = activeWorkers

	if err := r.pool.Ping(ctx); err == nil {
		result.Database.Healthy = true
	}

	return result, nil
}
