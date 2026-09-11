-- +goose Up
-- Cancelling an execution now reaches work that is already in flight: the
-- worker holding the claim loses its lease on the next heartbeat and stops the
-- task. The in-flight attempt has to be closed too, otherwise history keeps
-- showing a live attempt for work that was deliberately stopped.
ALTER TABLE task_attempts DROP CONSTRAINT task_attempts_status_check;
ALTER TABLE task_attempts ADD CONSTRAINT task_attempts_status_check CHECK (status IN ('running', 'succeeded', 'failed', 'worker_lost', 'cancelled'));

-- +goose Down
ALTER TABLE task_attempts DROP CONSTRAINT task_attempts_status_check;
ALTER TABLE task_attempts ADD CONSTRAINT task_attempts_status_check CHECK (status IN ('running', 'succeeded', 'failed', 'worker_lost'));
