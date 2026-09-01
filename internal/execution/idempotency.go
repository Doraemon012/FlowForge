package execution

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrIdempotencyKeyExists = errors.New("idempotency key already used")
	ErrIdempotencyNotFound  = errors.New("idempotency key not found")
)

type IdempotencyRepository interface {
	// RecordIdempotencyKey stores the mapping between an idempotency key and execution ID
	// Returns an error if the key already exists with a different execution ID
	RecordIdempotencyKey(ctx context.Context, projectID, executionID uuid.UUID, idempotencyKey string, createdAt time.Time) error

	// GetExecutionByIdempotencyKey retrieves the execution ID associated with an idempotency key
	GetExecutionByIdempotencyKey(ctx context.Context, projectID uuid.UUID, idempotencyKey string) (uuid.UUID, error)
}

type PostgresIdempotencyRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresIdempotencyRepository(pool *pgxpool.Pool) *PostgresIdempotencyRepository {
	return &PostgresIdempotencyRepository{pool: pool}
}

func (r *PostgresIdempotencyRepository) RecordIdempotencyKey(ctx context.Context, projectID, executionID uuid.UUID, idempotencyKey string, createdAt time.Time) error {
	if idempotencyKey == "" {
		return errors.New("idempotency key is required")
	}

	// Try to insert, but check if it already exists with a different execution ID first
	var existingExecutionID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT execution_id FROM execution_idempotency WHERE idempotency_key = $1 AND project_id = $2
	`, idempotencyKey, projectID).Scan(&existingExecutionID)

	if err == nil {
		// Key exists
		if existingExecutionID != executionID {
			return ErrIdempotencyKeyExists
		}
		// Same execution ID, this is a duplicate request - that's OK
		return nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	// Key doesn't exist, insert it
	_, err = r.pool.Exec(ctx, `
		INSERT INTO execution_idempotency (idempotency_key, execution_id, project_id, created_at)
		VALUES ($1, $2, $3, $4)
	`, idempotencyKey, executionID, projectID, createdAt)

	// Handle race condition where another request inserted the same key.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		// Check if it's the same execution ID.
		err = r.pool.QueryRow(ctx, `
			SELECT execution_id FROM execution_idempotency WHERE idempotency_key = $1 AND project_id = $2
		`, idempotencyKey, projectID).Scan(&existingExecutionID)
		if err == nil && existingExecutionID == executionID {
			return nil
		}
		return ErrIdempotencyKeyExists
	}

	return err
}

func (r *PostgresIdempotencyRepository) GetExecutionByIdempotencyKey(ctx context.Context, projectID uuid.UUID, idempotencyKey string) (uuid.UUID, error) {
	var executionID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT execution_id FROM execution_idempotency WHERE idempotency_key = $1 AND project_id = $2
	`, idempotencyKey, projectID).Scan(&executionID)

	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrIdempotencyNotFound
	}
	return executionID, err
}
