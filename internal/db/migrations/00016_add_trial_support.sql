-- +goose Up
-- Trial accounts are ordinary users with is_trial = true. They have no
-- password (password_hash stays empty) so they can never be authenticated
-- through the normal login flow, and they own their projects/workflows just
-- like a registered user, which is what keeps trial data isolated.
ALTER TABLE users ADD COLUMN is_trial BOOLEAN NOT NULL DEFAULT false;

-- A partial index keeps lookups of trial accounts cheap without penalising the
-- much larger registered-user population.
CREATE INDEX users_is_trial_idx ON users (is_trial) WHERE is_trial;

-- Per-trial-account AI consumption. Counting in the database (rather than the
-- client or process memory) is what makes the trial AI limits enforceable and
-- durable across restarts.
CREATE TABLE trial_ai_usage (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    generation_uses INTEGER NOT NULL DEFAULT 0,
    edit_uses INTEGER NOT NULL DEFAULT 0,
    total_uses INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT trial_ai_usage_non_negative CHECK (
        generation_uses >= 0 AND edit_uses >= 0 AND total_uses >= 0
    )
);

-- +goose Down
DROP TABLE trial_ai_usage;
DROP INDEX users_is_trial_idx;
ALTER TABLE users DROP COLUMN is_trial;
