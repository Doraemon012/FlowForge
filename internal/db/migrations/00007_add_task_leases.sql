-- +goose Up
ALTER TABLE task_queue ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_queue ADD COLUMN lease_token TEXT;
ALTER TABLE task_queue ADD COLUMN lease_expires_at TIMESTAMPTZ;
ALTER TABLE task_queue ADD COLUMN last_heartbeat_at TIMESTAMPTZ;

CREATE INDEX task_queue_claimed_expiry_idx ON task_queue (lease_expires_at) WHERE status = 'claimed';

CREATE TABLE task_attempts (
    id UUID PRIMARY KEY,
    task_run_id UUID NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    worker_id TEXT NOT NULL,
    lease_token TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL,
    lease_expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    failure_reason TEXT NOT NULL DEFAULT '',
    CONSTRAINT task_attempts_status_check CHECK (status IN ('running', 'succeeded', 'failed', 'worker_lost')),
    CONSTRAINT task_attempts_unique_attempt UNIQUE (task_run_id, attempt_number)
);

CREATE INDEX task_attempts_task_run_idx ON task_attempts (task_run_id, attempt_number);

-- +goose Down
DROP INDEX task_attempts_task_run_idx;
DROP TABLE task_attempts;
DROP INDEX task_queue_claimed_expiry_idx;

ALTER TABLE task_queue DROP COLUMN last_heartbeat_at;
ALTER TABLE task_queue DROP COLUMN lease_expires_at;
ALTER TABLE task_queue DROP COLUMN lease_token;
ALTER TABLE task_queue DROP COLUMN attempt_number;
