package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound        = errors.New("workflow not found")
	ErrProjectNotFound = errors.New("project not found")
	ErrVersionNotFound = errors.New("workflow version not found")
)

var supportedTaskTypes = map[string]struct{}{
	"http": {}, "transform": {}, "delay": {}, "conditional": {}, "email": {},
}

type Definition struct {
	Tasks []Task `json:"tasks"`
}

type Task struct {
	ID           string          `json:"id"`
	Type         string          `json:"type"`
	Config       json.RawMessage `json:"config"`
	Dependencies []string        `json:"depends_on"`
}

type Workflow struct {
	ID              uuid.UUID  `json:"id"`
	ProjectID       uuid.UUID  `json:"project_id"`
	Name            string     `json:"name"`
	Description     string     `json:"description"`
	Status          string     `json:"status"`
	DraftDefinition Definition `json:"draft_definition"`
	ActiveVersionID *uuid.UUID `json:"active_version_id,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type Version struct {
	ID            uuid.UUID  `json:"id"`
	WorkflowID    uuid.UUID  `json:"workflow_id"`
	VersionNumber int        `json:"version_number"`
	Definition    Definition `json:"definition"`
	CreatedAt     time.Time  `json:"created_at"`
}

type Repository interface {
	Create(ctx context.Context, ownerID, projectID uuid.UUID, workflow Workflow) error
	GetOwned(ctx context.Context, ownerID, workflowID uuid.UUID) (Workflow, error)
	UpdateOwned(ctx context.Context, ownerID, workflowID uuid.UUID, name, description string, definition Definition, updatedAt time.Time) (Workflow, error)
	ListVersionsOwned(ctx context.Context, ownerID, workflowID uuid.UUID) ([]Version, error)
	GetVersionOwned(ctx context.Context, ownerID, workflowID, versionID uuid.UUID) (Version, error)
	PublishOwned(ctx context.Context, ownerID, workflowID uuid.UUID, definition Definition, now time.Time) (Version, error)
	ActivateVersionOwned(ctx context.Context, ownerID, workflowID, versionID uuid.UUID, now time.Time) error
	DeactivateOwned(ctx context.Context, ownerID, workflowID uuid.UUID, now time.Time) error
}

type PostgresRepository struct{ pool *pgxpool.Pool }

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func ValidateDefinition(definition Definition) []string {
	errorsFound := make([]string, 0)
	if len(definition.Tasks) == 0 {
		return []string{"tasks must contain at least one task"}
	}

	ids := make(map[string]struct{}, len(definition.Tasks))
	for _, task := range definition.Tasks {
		if strings.TrimSpace(task.ID) == "" {
			errorsFound = append(errorsFound, "task id is required")
			continue
		}
		if _, exists := ids[task.ID]; exists {
			errorsFound = append(errorsFound, fmt.Sprintf("duplicate task id: %s", task.ID))
		} else {
			ids[task.ID] = struct{}{}
		}
		if _, supported := supportedTaskTypes[task.Type]; !supported {
			errorsFound = append(errorsFound, fmt.Sprintf("unsupported task type for %s: %s", task.ID, task.Type))
		}
		if len(task.Config) == 0 {
			errorsFound = append(errorsFound, fmt.Sprintf("task config is required: %s", task.ID))
		} else {
			var config map[string]json.RawMessage
			if err := json.Unmarshal(task.Config, &config); err != nil || config == nil {
				errorsFound = append(errorsFound, fmt.Sprintf("task config must be a JSON object: %s", task.ID))
			}
		}
	}

	graph := make(map[string][]string, len(ids))
	for _, task := range definition.Tasks {
		for _, dependency := range task.Dependencies {
			if _, exists := ids[dependency]; !exists {
				errorsFound = append(errorsFound, fmt.Sprintf("unknown dependency for %s: %s", task.ID, dependency))
				continue
			}
			if dependency == task.ID {
				errorsFound = append(errorsFound, fmt.Sprintf("task cannot depend on itself: %s", task.ID))
			}
			graph[dependency] = append(graph[dependency], task.ID)
		}
		if _, exists := graph[task.ID]; !exists {
			graph[task.ID] = nil
		}
	}

	state := make(map[string]int, len(ids))
	var visit func(string)
	visit = func(id string) {
		if state[id] == 1 {
			errorsFound = append(errorsFound, fmt.Sprintf("dependency cycle detected at task: %s", id))
			return
		}
		if state[id] == 2 {
			return
		}
		state[id] = 1
		dependencies := make([]string, 0)
		for _, task := range definition.Tasks {
			if task.ID == id {
				dependencies = append(dependencies, task.Dependencies...)
			}
		}
		sort.Strings(dependencies)
		for _, dependency := range dependencies {
			if _, exists := ids[dependency]; exists {
				visit(dependency)
			}
		}
		state[id] = 2
	}
	allIDs := make([]string, 0, len(ids))
	for id := range ids {
		allIDs = append(allIDs, id)
	}
	sort.Strings(allIDs)
	for _, id := range allIDs {
		visit(id)
	}

	sort.Strings(errorsFound)
	return errorsFound
}

func (r *PostgresRepository) Create(ctx context.Context, ownerID, projectID uuid.UUID, item Workflow) error {
	definition, err := json.Marshal(item.DraftDefinition)
	if err != nil {
		return err
	}
	err = r.pool.QueryRow(ctx, `
		INSERT INTO workflows (id, project_id, name, description, status, draft_definition, created_at, updated_at)
		SELECT $1, p.id, $3, $4, 'draft', $5, $6, $6 FROM projects p
		WHERE p.id = $2 AND p.owner_id = $7 AND p.status = 'active'
		RETURNING id`, item.ID, projectID, item.Name, item.Description, definition, item.CreatedAt, ownerID).Scan(&item.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrProjectNotFound
	}
	return err
}

func (r *PostgresRepository) GetOwned(ctx context.Context, ownerID, workflowID uuid.UUID) (Workflow, error) {
	var result Workflow
	var definition []byte
	err := r.pool.QueryRow(ctx, `
		SELECT w.id, w.project_id, w.name, w.description, w.status, w.draft_definition, w.active_version_id, w.created_at, w.updated_at
		FROM workflows w JOIN projects p ON p.id = w.project_id
		WHERE w.id = $1 AND p.owner_id = $2`, workflowID, ownerID).Scan(&result.ID, &result.ProjectID, &result.Name, &result.Description, &result.Status, &definition, &result.ActiveVersionID, &result.CreatedAt, &result.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Workflow{}, ErrNotFound
	}
	if err != nil {
		return Workflow{}, err
	}
	if err := json.Unmarshal(definition, &result.DraftDefinition); err != nil {
		return Workflow{}, err
	}
	return result, nil
}

func (r *PostgresRepository) UpdateOwned(ctx context.Context, ownerID, workflowID uuid.UUID, name, description string, definition Definition, updatedAt time.Time) (Workflow, error) {
	encoded, err := json.Marshal(definition)
	if err != nil {
		return Workflow{}, err
	}
	var result Workflow
	var draft []byte
	err = r.pool.QueryRow(ctx, `
		UPDATE workflows w SET name = $1, description = $2, draft_definition = $3, updated_at = $4
		FROM projects p WHERE w.project_id = p.id AND w.id = $5 AND p.owner_id = $6 AND w.status <> 'archived'
		RETURNING w.id, w.project_id, w.name, w.description, w.status, w.draft_definition, w.active_version_id, w.created_at, w.updated_at`, name, description, encoded, updatedAt, workflowID, ownerID).Scan(&result.ID, &result.ProjectID, &result.Name, &result.Description, &result.Status, &draft, &result.ActiveVersionID, &result.CreatedAt, &result.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Workflow{}, ErrNotFound
	}
	if err != nil {
		return Workflow{}, err
	}
	if err := json.Unmarshal(draft, &result.DraftDefinition); err != nil {
		return Workflow{}, err
	}
	return result, nil
}

func (r *PostgresRepository) ListVersionsOwned(ctx context.Context, ownerID, workflowID uuid.UUID) ([]Version, error) {
	rows, err := r.pool.Query(ctx, `SELECT v.id, v.workflow_id, v.version_number, v.definition, v.created_at FROM workflow_versions v JOIN workflows w ON w.id = v.workflow_id JOIN projects p ON p.id = w.project_id WHERE v.workflow_id = $1 AND p.owner_id = $2 ORDER BY v.version_number`, workflowID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := make([]Version, 0)
	for rows.Next() {
		var result Version
		var definition []byte
		if err := rows.Scan(&result.ID, &result.WorkflowID, &result.VersionNumber, &definition, &result.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(definition, &result.Definition); err != nil {
			return nil, err
		}
		versions = append(versions, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return versions, nil
}

func (r *PostgresRepository) GetVersionOwned(ctx context.Context, ownerID, workflowID, versionID uuid.UUID) (Version, error) {
	var result Version
	var definition []byte
	err := r.pool.QueryRow(ctx, `SELECT v.id, v.workflow_id, v.version_number, v.definition, v.created_at FROM workflow_versions v JOIN workflows w ON w.id = v.workflow_id JOIN projects p ON p.id = w.project_id WHERE v.id = $1 AND v.workflow_id = $2 AND p.owner_id = $3`, versionID, workflowID, ownerID).Scan(&result.ID, &result.WorkflowID, &result.VersionNumber, &definition, &result.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Version{}, ErrVersionNotFound
	}
	if err != nil {
		return Version{}, err
	}
	if err := json.Unmarshal(definition, &result.Definition); err != nil {
		return Version{}, err
	}
	return result, nil
}

func (r *PostgresRepository) PublishOwned(ctx context.Context, ownerID, workflowID uuid.UUID, definition Definition, now time.Time) (Version, error) {
	encoded, err := json.Marshal(definition)
	if err != nil {
		return Version{}, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Version{}, err
	}
	defer tx.Rollback(ctx)
	var version Version
	var next int
	var lockedWorkflowID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT w.id FROM workflows w JOIN projects p ON p.id = w.project_id WHERE w.id = $1 AND p.owner_id = $2 AND w.status <> 'archived' FOR UPDATE`, workflowID, ownerID).Scan(&lockedWorkflowID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Version{}, ErrNotFound
		}
		return Version{}, err
	}
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(version_number), 0) + 1 FROM workflow_versions WHERE workflow_id = $1`, workflowID).Scan(&next); err != nil {
		return Version{}, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO workflow_versions (id, workflow_id, version_number, definition, created_at) SELECT $1, w.id, $3, $4, $5 FROM workflows w JOIN projects p ON p.id = w.project_id WHERE w.id = $2 AND p.owner_id = $6 AND w.status <> 'archived' RETURNING id, workflow_id, version_number, definition, created_at`, uuid.New(), workflowID, next, encoded, now, ownerID).Scan(&version.ID, &version.WorkflowID, &version.VersionNumber, &encoded, &version.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Version{}, ErrNotFound
	}
	if err != nil {
		return Version{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Version{}, err
	}
	if err := json.Unmarshal(encoded, &version.Definition); err != nil {
		return Version{}, err
	}
	return version, nil
}

func (r *PostgresRepository) ActivateVersionOwned(ctx context.Context, ownerID, workflowID, versionID uuid.UUID, now time.Time) error {
	tag, err := r.pool.Exec(ctx, `UPDATE workflows w SET active_version_id = $1, status = 'active', updated_at = $2 FROM projects p WHERE w.id = $3 AND w.project_id = p.id AND p.owner_id = $4 AND EXISTS (SELECT 1 FROM workflow_versions v WHERE v.id = $1 AND v.workflow_id = w.id)`, versionID, now, workflowID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrVersionNotFound
	}
	return nil
}

func (r *PostgresRepository) DeactivateOwned(ctx context.Context, ownerID, workflowID uuid.UUID, now time.Time) error {
	tag, err := r.pool.Exec(ctx, `UPDATE workflows w SET active_version_id = NULL, status = 'paused', updated_at = $1 FROM projects p WHERE w.id = $2 AND w.project_id = p.id AND p.owner_id = $3`, now, workflowID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
