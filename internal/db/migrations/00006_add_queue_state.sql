-- +goose Up
ALTER TABLE task_runs DROP CONSTRAINT task_runs_status_check;
ALTER TABLE task_runs ADD CONSTRAINT task_runs_status_check CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'blocked'));

CREATE TABLE task_queue (
    id UUID PRIMARY KEY,
    task_run_id UUID NOT NULL UNIQUE REFERENCES task_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    worker_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT task_queue_status_check CHECK (status IN ('queued', 'claimed', 'completed', 'failed'))
);

CREATE INDEX task_queue_available_idx ON task_queue (created_at) WHERE status = 'queued';

-- +goose Down
DROP TABLE task_queue;
ALTER TABLE task_runs DROP CONSTRAINT task_runs_status_check;
ALTER TABLE task_runs ADD CONSTRAINT task_runs_status_check CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'blocked'));
