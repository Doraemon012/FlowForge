-- +goose Up
-- Social sign-in keeps the provider link in its own table rather than as
-- columns on users: a user may sign in with several providers, and a provider
-- identity is a (provider, subject) pair, not a property of the account.
--
-- provider_subject is the provider's stable user id ("sub"). It is the link
-- key, never the email: an email address can be reassigned by the provider,
-- while the subject cannot.
CREATE TABLE user_identities (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_subject TEXT NOT NULL,
    -- The address the provider asserted when the link was created. Kept for
    -- operator diagnostics only; it is intentionally not used for lookups.
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    -- One provider account maps to exactly one FlowForge user, which is what
    -- makes sign-in idempotent and prevents duplicate accounts.
    PRIMARY KEY (provider, provider_subject),
    CONSTRAINT user_identities_provider_check CHECK (provider <> ''),
    CONSTRAINT user_identities_subject_check CHECK (provider_subject <> '')
);

-- At most one identity per provider per user, so an account cannot accumulate
-- two different Google links (which would make which one signs in ambiguous).
CREATE UNIQUE INDEX user_identities_user_provider_idx ON user_identities (user_id, provider);

-- Supports "which providers does this account use", e.g. when rendering an
-- account's linked sign-in methods.
CREATE INDEX user_identities_user_id_idx ON user_identities (user_id);

-- +goose Down
DROP TABLE user_identities;
