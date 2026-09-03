-- +goose Up
CREATE TABLE log_entries (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL DEFAULT '',
    task_run_id UUID,
    task_attempt_id UUID,
    worker_id TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'info',
    source TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX log_entries_execution_idx ON log_entries (execution_id, created_at, id);
CREATE INDEX log_entries_project_idx ON log_entries (project_id, created_at);

-- +goose Down
DROP INDEX log_entries_project_idx;
DROP INDEX log_entries_execution_idx;
DROP TABLE log_entries;
