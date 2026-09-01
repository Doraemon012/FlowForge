package project

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

var ErrNotFound = errors.New("project not found")

type Project struct {
	ID        uuid.UUID `json:"id"`
	OwnerID   uuid.UUID `json:"owner_id"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Repository interface {
	Create(ctx context.Context, project Project) error
	GetOwned(ctx context.Context, ownerID, projectID uuid.UUID) (Project, error)
	GetOwner(ctx context.Context, projectID uuid.UUID) (uuid.UUID, error)
	ListOwned(ctx context.Context, ownerID uuid.UUID) ([]Project, error)
	UpdateOwned(ctx context.Context, ownerID, projectID uuid.UUID, name string, updatedAt time.Time) (Project, error)
	ArchiveOwned(ctx context.Context, ownerID, projectID uuid.UUID, updatedAt time.Time) error
}

type PostgresRepository struct{ pool *pgxpool.Pool }

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) Create(ctx context.Context, project Project) error {
	if project.ID == uuid.Nil || project.OwnerID == uuid.Nil {
		return errors.New("project and owner IDs are required")
	}
	if strings.TrimSpace(project.Name) == "" {
		return errors.New("project name is required")
	}
	if project.Status == "" {
		project.Status = "active"
	}
	_, err := r.pool.Exec(ctx, `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`, project.ID, project.OwnerID, project.Name, project.Status, project.CreatedAt, project.UpdatedAt)
	return err
}

func (r *PostgresRepository) GetOwned(ctx context.Context, ownerID, projectID uuid.UUID) (Project, error) {
	var result Project
	err := r.pool.QueryRow(ctx, `SELECT id, owner_id, name, status, created_at, updated_at FROM projects WHERE id = $1 AND owner_id = $2`, projectID, ownerID).Scan(&result.ID, &result.OwnerID, &result.Name, &result.Status, &result.CreatedAt, &result.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	if err != nil {
		return Project{}, err
	}
	return result, nil
}

func (r *PostgresRepository) GetOwner(ctx context.Context, projectID uuid.UUID) (uuid.UUID, error) {
	var ownerID uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT owner_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	return ownerID, err
}

func (r *PostgresRepository) ListOwned(ctx context.Context, ownerID uuid.UUID) ([]Project, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, owner_id, name, status, created_at, updated_at FROM projects WHERE owner_id = $1 ORDER BY created_at, id`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := make([]Project, 0)
	for rows.Next() {
		var result Project
		if err := rows.Scan(&result.ID, &result.OwnerID, &result.Name, &result.Status, &result.CreatedAt, &result.UpdatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return projects, nil
}

func (r *PostgresRepository) UpdateOwned(ctx context.Context, ownerID, projectID uuid.UUID, name string, updatedAt time.Time) (Project, error) {
	if strings.TrimSpace(name) == "" {
		return Project{}, errors.New("project name is required")
	}
	var result Project
	err := r.pool.QueryRow(ctx, `UPDATE projects SET name = $1, updated_at = $2 WHERE id = $3 AND owner_id = $4 AND status = 'active' RETURNING id, owner_id, name, status, created_at, updated_at`, name, updatedAt, projectID, ownerID).Scan(&result.ID, &result.OwnerID, &result.Name, &result.Status, &result.CreatedAt, &result.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	if err != nil {
		return Project{}, err
	}
	return result, nil
}

func (r *PostgresRepository) ArchiveOwned(ctx context.Context, ownerID, projectID uuid.UUID, updatedAt time.Time) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET status = 'archived', updated_at = $1 WHERE id = $2 AND owner_id = $3 AND status = 'active'`, updatedAt, projectID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w", ErrNotFound)
	}
	return nil
}
