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

var ErrNotFound = errors.New("user not found")

type User struct {
	ID          uuid.UUID
	Email       string
	DisplayName string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Repository interface {
	Create(ctx context.Context, user User) error
	GetByID(ctx context.Context, id uuid.UUID) (User, error)
}

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) Create(ctx context.Context, user User) error {
	if user.ID == uuid.Nil {
		return fmt.Errorf("user ID is required")
	}
	if strings.TrimSpace(user.Email) == "" {
		return fmt.Errorf("user email is required")
	}
	if strings.TrimSpace(user.DisplayName) == "" {
		return fmt.Errorf("user display name is required")
	}
	if user.Status == "" {
		user.Status = "active"
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (id, email, display_name, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, user.ID, user.Email, user.DisplayName, user.Status, user.CreatedAt, user.UpdatedAt)
	return err
}

func (r *PostgresRepository) GetByID(ctx context.Context, id uuid.UUID) (User, error) {
	var user User
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, display_name, status, created_at, updated_at
		FROM users WHERE id = $1
	`, id).Scan(&user.ID, &user.Email, &user.DisplayName, &user.Status, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return user, nil
}
