-- +goose Up
-- Cancellation lets a user stop a pending/running execution. The status is
-- spelled "cancelled" to match the user-facing contract already used by the
-- frontend (execution-status labels) and the execution documentation.
ALTER TABLE executions DROP CONSTRAINT executions_status_check;
ALTER TABLE executions ADD CONSTRAINT executions_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

-- A not-yet-started task run is cancelled when its execution is cancelled, so
-- the task list shows which work was abandoned rather than leaving it pending.
ALTER TABLE task_runs DROP CONSTRAINT task_runs_status_check;
ALTER TABLE task_runs ADD CONSTRAINT task_runs_status_check CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled'));

-- Cancelling the queue row is what stops a worker from ever claiming the work.
ALTER TABLE task_queue DROP CONSTRAINT task_queue_status_check;
ALTER TABLE task_queue ADD CONSTRAINT task_queue_status_check CHECK (status IN ('queued', 'claimed', 'completed', 'failed', 'cancelled'));

-- +goose Down
ALTER TABLE task_queue DROP CONSTRAINT task_queue_status_check;
ALTER TABLE task_queue ADD CONSTRAINT task_queue_status_check CHECK (status IN ('queued', 'claimed', 'completed', 'failed'));

ALTER TABLE task_runs DROP CONSTRAINT task_runs_status_check;
ALTER TABLE task_runs ADD CONSTRAINT task_runs_status_check CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'blocked'));

ALTER TABLE executions DROP CONSTRAINT executions_status_check;
ALTER TABLE executions ADD CONSTRAINT executions_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed'));
