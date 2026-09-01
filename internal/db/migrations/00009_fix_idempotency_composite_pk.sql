-- +goose Up
ALTER TABLE execution_idempotency DROP CONSTRAINT execution_idempotency_pkey;
ALTER TABLE execution_idempotency ADD CONSTRAINT execution_idempotency_pkey PRIMARY KEY (idempotency_key, project_id);

-- +goose Down
ALTER TABLE execution_idempotency DROP CONSTRAINT execution_idempotency_pkey;
ALTER TABLE execution_idempotency ADD CONSTRAINT execution_idempotency_pkey PRIMARY KEY (idempotency_key);
