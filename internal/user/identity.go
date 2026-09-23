package user

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Identity is the link between one provider account and one FlowForge user.
//
// It is stored separately from User because the link is a relationship: an
// account may sign in with more than one provider, and the same provider
// identity must resolve to the same account every time. ProviderSubject is the
// provider's own immutable user id, which is the only safe link key — an email
// address can be reassigned by the provider.
type Identity struct {
	UserID          uuid.UUID
	Provider        string
	ProviderSubject string
	Email           string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// IdentityRepository stores provider links. It is a separate interface from
// Repository so the email/password paths keep depending on exactly what they
// need, and so a deployment can be exercised with one and not the other.
type IdentityRepository interface {
	// GetBySubject resolves the account a provider identity belongs to. It
	// returns ErrNotFound when the provider account has never signed in.
	GetBySubject(ctx context.Context, provider, subject string) (Identity, error)
	// GetByUserAndProvider reports the provider link an account already has,
	// which is how a conflicting second link for the same provider is detected.
	GetByUserAndProvider(ctx context.Context, userID uuid.UUID, provider string) (Identity, error)
	// Create links a provider identity to an account.
	Create(ctx context.Context, identity Identity) error
}

type PostgresIdentityRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresIdentityRepository(pool *pgxpool.Pool) *PostgresIdentityRepository {
	return &PostgresIdentityRepository{pool: pool}
}

const identityColumns = `user_id, provider, provider_subject, email, created_at, updated_at`

func (r *PostgresIdentityRepository) GetBySubject(ctx context.Context, provider, subject string) (Identity, error) {
	return r.queryIdentity(ctx, `
		SELECT `+identityColumns+`
		FROM user_identities WHERE provider = $1 AND provider_subject = $2
	`, provider, subject)
}

func (r *PostgresIdentityRepository) GetByUserAndProvider(ctx context.Context, userID uuid.UUID, provider string) (Identity, error) {
	return r.queryIdentity(ctx, `
		SELECT `+identityColumns+`
		FROM user_identities WHERE user_id = $1 AND provider = $2
	`, userID, provider)
}

func (r *PostgresIdentityRepository) queryIdentity(ctx context.Context, query string, args ...any) (Identity, error) {
	var identity Identity
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&identity.UserID,
		&identity.Provider,
		&identity.ProviderSubject,
		&identity.Email,
		&identity.CreatedAt,
		&identity.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Identity{}, ErrNotFound
	}
	if err != nil {
		return Identity{}, err
	}
	return identity, nil
}

func (r *PostgresIdentityRepository) Create(ctx context.Context, identity Identity) error {
	if identity.UserID == uuid.Nil {
		return fmt.Errorf("identity user ID is required")
	}
	if strings.TrimSpace(identity.Provider) == "" || strings.TrimSpace(identity.ProviderSubject) == "" {
		return fmt.Errorf("identity provider and subject are required")
	}
	if strings.TrimSpace(identity.Email) == "" {
		return fmt.Errorf("identity email is required")
	}
	if identity.CreatedAt.IsZero() {
		identity.CreatedAt = time.Now().UTC()
	}
	if identity.UpdatedAt.IsZero() {
		identity.UpdatedAt = identity.CreatedAt
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, provider_subject, email, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, identity.UserID, identity.Provider, identity.ProviderSubject, identity.Email, identity.CreatedAt, identity.UpdatedAt)
	return err
}
