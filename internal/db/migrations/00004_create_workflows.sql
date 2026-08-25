-- +goose Up
CREATE TABLE workflows (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    draft_definition JSONB NOT NULL,
    active_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT workflows_status_check CHECK (status IN ('draft', 'active', 'paused', 'archived')),
    CONSTRAINT workflows_project_name_unique UNIQUE (project_id, name)
);

CREATE INDEX workflows_project_id_idx ON workflows (project_id);

CREATE TABLE workflow_versions (
    id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    version_number INTEGER NOT NULL,
    definition JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT workflow_versions_workflow_number_unique UNIQUE (workflow_id, version_number)
);

ALTER TABLE workflows
    ADD CONSTRAINT workflows_active_version_fk
    FOREIGN KEY (active_version_id) REFERENCES workflow_versions(id);

-- +goose Down
ALTER TABLE workflows DROP CONSTRAINT workflows_active_version_fk;
DROP TABLE workflow_versions;
DROP TABLE workflows;