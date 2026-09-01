-- +goose Up
ALTER TABLE task_attempts ADD COLUMN failure_classification TEXT NOT NULL DEFAULT '';
ALTER TABLE task_runs ADD COLUMN failure_classification TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE task_runs DROP COLUMN failure_classification;
ALTER TABLE task_attempts DROP COLUMN failure_classification;
