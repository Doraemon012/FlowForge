package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("webhook not found")
)

type Webhook struct {
	ID         string    `json:"id"`
	ProjectID  uuid.UUID `json:"project_id"`
	WorkflowID uuid.UUID `json:"workflow_id"`
	Enabled    bool      `json:"enabled"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Repository interface {
	Create(ctx context.Context, webhook Webhook, secretHash string) error
	GetByID(ctx context.Context, projectID uuid.UUID, webhookID string) (Webhook, error)
	GetByPublicID(ctx context.Context, webhookID string) (Webhook, error)
	GetSecretHash(ctx context.Context, webhookID string) (string, error)
	ListByWorkflow(ctx context.Context, projectID, workflowID uuid.UUID) ([]Webhook, error)
	UpdateEnabled(ctx context.Context, projectID uuid.UUID, webhookID string, enabled bool, updatedAt time.Time) error
	Delete(ctx context.Context, projectID uuid.UUID, webhookID string) error
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) Create(ctx context.Context, webhook Webhook, secretHash string) error {
	if webhook.ID == "" || webhook.ProjectID == uuid.Nil || webhook.WorkflowID == uuid.Nil {
		return errors.New("webhook ID, project ID, and workflow ID are required")
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO webhook_endpoints (id, project_id, workflow_id, secret_hash, enabled, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, webhook.ID, webhook.ProjectID, webhook.WorkflowID, secretHash, webhook.Enabled, webhook.CreatedAt, webhook.UpdatedAt)
	return err
}

func (r *PostgresRepository) GetByID(ctx context.Context, projectID uuid.UUID, webhookID string) (Webhook, error) {
	var result Webhook
	err := r.pool.QueryRow(ctx, `
		SELECT id, project_id, workflow_id, enabled, created_at, updated_at
		FROM webhook_endpoints
		WHERE id = $1 AND project_id = $2
	`, webhookID, projectID).Scan(
		&result.ID, &result.ProjectID, &result.WorkflowID, &result.Enabled, &result.CreatedAt, &result.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Webhook{}, ErrNotFound
	}
	return result, err
}

func (r *PostgresRepository) GetByPublicID(ctx context.Context, webhookID string) (Webhook, error) {
	var result Webhook
	err := r.pool.QueryRow(ctx, `
		SELECT id, project_id, workflow_id, enabled, created_at, updated_at
		FROM webhook_endpoints
		WHERE id = $1
	`, webhookID).Scan(
		&result.ID, &result.ProjectID, &result.WorkflowID, &result.Enabled, &result.CreatedAt, &result.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Webhook{}, ErrNotFound
	}
	return result, err
}

func (r *PostgresRepository) GetSecretHash(ctx context.Context, webhookID string) (string, error) {
	var secretHash string
	err := r.pool.QueryRow(ctx, `
		SELECT secret_hash FROM webhook_endpoints WHERE id = $1
	`, webhookID).Scan(&secretHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return secretHash, err
}

func (r *PostgresRepository) ListByWorkflow(ctx context.Context, projectID, workflowID uuid.UUID) ([]Webhook, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, project_id, workflow_id, enabled, created_at, updated_at
		FROM webhook_endpoints
		WHERE project_id = $1 AND workflow_id = $2 AND enabled = true
		ORDER BY created_at, id
	`, projectID, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	webhooks := make([]Webhook, 0)
	for rows.Next() {
		var result Webhook
		if err := rows.Scan(
			&result.ID, &result.ProjectID, &result.WorkflowID, &result.Enabled, &result.CreatedAt, &result.UpdatedAt,
		); err != nil {
			return nil, err
		}
		webhooks = append(webhooks, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return webhooks, nil
}

func (r *PostgresRepository) UpdateEnabled(ctx context.Context, projectID uuid.UUID, webhookID string, enabled bool, updatedAt time.Time) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE webhook_endpoints SET enabled = $1, updated_at = $2
		WHERE id = $3 AND project_id = $4
	`, enabled, updatedAt, webhookID, projectID)
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (r *PostgresRepository) Delete(ctx context.Context, projectID uuid.UUID, webhookID string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM webhook_endpoints WHERE id = $1 AND project_id = $2
	`, webhookID, projectID)
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// SignPayload creates an HMAC-SHA256 signature of the payload using the secret
func SignPayload(secret string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifySignature validates that the provided signature matches the payload signed with the secret
func VerifySignature(secret string, payload []byte, signature string) bool {
	expected := SignPayload(secret, payload)
	return hmac.Equal([]byte(expected), []byte(signature))
}
