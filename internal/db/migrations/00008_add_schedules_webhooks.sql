-- +goose Up
CREATE TABLE schedules (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    enabled BOOLEAN NOT NULL DEFAULT true,
    next_occurrence TIMESTAMPTZ,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT schedules_project_workflow_unique UNIQUE (project_id, workflow_id)
);

CREATE INDEX schedules_next_occurrence_idx ON schedules (next_occurrence) WHERE enabled = true;
CREATE INDEX schedules_project_idx ON schedules (project_id);

CREATE TABLE webhook_endpoints (
    id TEXT PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    enabled BOOLEAN NOT NULL DEFAULT true,
    secret_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX webhook_endpoints_project_idx ON webhook_endpoints (project_id);

CREATE TABLE execution_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES executions(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX execution_idempotency_execution_idx ON execution_idempotency (execution_id);
CREATE INDEX execution_idempotency_project_idx ON execution_idempotency (project_id);

-- +goose Down
DROP INDEX execution_idempotency_project_idx;
DROP INDEX execution_idempotency_execution_idx;
DROP TABLE execution_idempotency;

DROP INDEX webhook_endpoints_project_idx;
DROP TABLE webhook_endpoints;

DROP INDEX schedules_project_idx;
DROP INDEX schedules_next_occurrence_idx;
DROP TABLE schedules;
