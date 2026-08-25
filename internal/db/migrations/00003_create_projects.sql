-- +goose Up
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT projects_status_check CHECK (status IN ('active', 'archived')),
    CONSTRAINT projects_owner_name_unique UNIQUE (owner_id, name)
);

CREATE INDEX projects_owner_id_idx ON projects (owner_id);

-- +goose Down
DROP TABLE projects;
