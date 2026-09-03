-- +goose Up
CREATE TABLE execution_events (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL DEFAULT '',
    task_run_id UUID,
    task_attempt_id UUID,
    worker_id TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX execution_events_execution_idx ON execution_events (execution_id, created_at, id);
CREATE INDEX execution_events_project_idx ON execution_events (project_id, created_at);

-- +goose Down
DROP INDEX execution_events_project_idx;
DROP INDEX execution_events_execution_idx;
DROP TABLE execution_events;
