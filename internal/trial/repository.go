package trial

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// unlimitedCap is used in place of a zero (disabled) limit so the SQL predicate
// stays uniform: a disabled cap must never block a use.
const unlimitedCap = 1 << 30

// Repository records and reports AI usage for trial accounts. Accounting lives
// in the database so the limits survive a process restart and cannot be reset
// by a client.
type Repository interface {
	// Consume atomically records one use of kind against the account and
	// returns the updated usage. It returns ErrLimitExceeded, recording
	// nothing, when the relevant cap has already been reached.
	Consume(ctx context.Context, userID uuid.UUID, kind Kind) (Usage, error)
	// Refund reverses a previously consumed use. The caller uses it when an AI
	// request failed for a reason the trial user should not be charged for,
	// such as a provider outage.
	Refund(ctx context.Context, userID uuid.UUID, kind Kind) error
	// Current reports the account's usage so far. An account with no recorded
	// usage reports zero.
	Current(ctx context.Context, userID uuid.UUID) (Usage, error)
	// Limits returns the configured allowance.
	Limits() Limits
}

// PostgresRepository is the PostgreSQL-backed Repository.
type PostgresRepository struct {
	pool   *pgxpool.Pool
	limits Limits
	now    func() time.Time
}

// NewPostgresRepository builds a repository with the given trial allowance.
func NewPostgresRepository(pool *pgxpool.Pool, limits Limits) *PostgresRepository {
	return &PostgresRepository{pool: pool, limits: limits, now: time.Now}
}

func (r *PostgresRepository) Limits() Limits { return r.limits }

// consumeGeneration increments the generation counter and the total, refusing
// the update when either cap is already reached. The single statement is what
// makes the check-then-increment atomic under concurrency.
const consumeGenerationSQL = `
	INSERT INTO trial_ai_usage (user_id, generation_uses, edit_uses, total_uses, created_at, updated_at)
	VALUES ($1, 1, 0, 1, $2, $2)
	ON CONFLICT (user_id) DO UPDATE
	SET generation_uses = trial_ai_usage.generation_uses + 1,
	    total_uses = trial_ai_usage.total_uses + 1,
	    updated_at = $2
	WHERE trial_ai_usage.generation_uses < $3
	  AND trial_ai_usage.total_uses < $4
	RETURNING generation_uses, edit_uses, total_uses`

const consumeEditSQL = `
	INSERT INTO trial_ai_usage (user_id, generation_uses, edit_uses, total_uses, created_at, updated_at)
	VALUES ($1, 0, 1, 1, $2, $2)
	ON CONFLICT (user_id) DO UPDATE
	SET edit_uses = trial_ai_usage.edit_uses + 1,
	    total_uses = trial_ai_usage.total_uses + 1,
	    updated_at = $2
	WHERE trial_ai_usage.edit_uses < $3
	  AND trial_ai_usage.total_uses < $4
	RETURNING generation_uses, edit_uses, total_uses`

func (r *PostgresRepository) Consume(ctx context.Context, userID uuid.UUID, kind Kind) (Usage, error) {
	var statement string
	var kindCap int
	switch kind {
	case KindGeneration:
		statement = consumeGenerationSQL
		kindCap = effectiveCap(r.limits.Generation)
	case KindEdit:
		statement = consumeEditSQL
		kindCap = effectiveCap(r.limits.Edit)
	default:
		return Usage{}, errors.New("unknown trial AI usage kind")
	}

	var usage Usage
	err := r.pool.QueryRow(ctx, statement, userID, r.now().UTC(), kindCap, effectiveCap(r.limits.Total)).
		Scan(&usage.Generation, &usage.Edit, &usage.Total)
	if errors.Is(err, pgx.ErrNoRows) {
		return Usage{}, ErrLimitExceeded
	}
	if err != nil {
		return Usage{}, err
	}
	return usage, nil
}

func (r *PostgresRepository) Refund(ctx context.Context, userID uuid.UUID, kind Kind) error {
	column := "generation_uses"
	if kind == KindEdit {
		column = "edit_uses"
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE trial_ai_usage
		SET `+column+` = GREATEST(`+column+` - 1, 0),
		    total_uses = GREATEST(total_uses - 1, 0),
		    updated_at = $2
		WHERE user_id = $1
	`, userID, r.now().UTC())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrLimitExceeded
	}
	return nil
}

func (r *PostgresRepository) Current(ctx context.Context, userID uuid.UUID) (Usage, error) {
	var usage Usage
	err := r.pool.QueryRow(ctx, `
		SELECT generation_uses, edit_uses, total_uses
		FROM trial_ai_usage WHERE user_id = $1
	`, userID).Scan(&usage.Generation, &usage.Edit, &usage.Total)
	if errors.Is(err, pgx.ErrNoRows) {
		return Usage{}, nil
	}
	if err != nil {
		return Usage{}, err
	}
	return usage, nil
}

func effectiveCap(configured int) int {
	if configured <= 0 {
		return unlimitedCap
	}
	return configured
}
