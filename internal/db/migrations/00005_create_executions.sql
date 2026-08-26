-- +goose Up
CREATE TABLE executions (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id),
    status TEXT NOT NULL DEFAULT 'pending',
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    failure_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT executions_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX executions_project_created_idx ON executions (project_id, created_at DESC);
CREATE INDEX executions_version_idx ON executions (workflow_version_id);

CREATE TABLE task_runs (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    output JSONB NOT NULL DEFAULT 'null'::jsonb,
    failure_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT task_runs_status_check CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'blocked')),
    CONSTRAINT task_runs_execution_task_unique UNIQUE (execution_id, task_id)
);

CREATE INDEX task_runs_execution_idx ON task_runs (execution_id);

-- +goose Down
DROP TABLE task_runs;
DROP TABLE executions;
