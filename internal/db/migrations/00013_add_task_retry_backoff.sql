-- +goose Up
ALTER TABLE task_queue ADD COLUMN not_before TIMESTAMPTZ;

-- +goose Down
ALTER TABLE task_queue DROP COLUMN not_before;
