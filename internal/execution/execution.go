package execution

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/workflow"
)

var (
	ErrNotFound       = errors.New("execution not found")
	ErrVersionInvalid = errors.New("workflow version is not executable")
)

type Execution struct {
	ID                uuid.UUID       `json:"id"`
	ProjectID         uuid.UUID       `json:"project_id"`
	WorkflowID        uuid.UUID       `json:"workflow_id"`
	WorkflowVersionID uuid.UUID       `json:"workflow_version_id"`
	Status            string          `json:"status"`
	Input             json.RawMessage `json:"input"`
	FailureReason     string          `json:"failure_reason,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	StartedAt         *time.Time      `json:"started_at,omitempty"`
	CompletedAt       *time.Time      `json:"completed_at,omitempty"`
}

type TaskRun struct {
	ID            uuid.UUID       `json:"id"`
	ExecutionID   uuid.UUID       `json:"execution_id"`
	TaskID        string          `json:"task_id"`
	Status        string          `json:"status"`
	Output        json.RawMessage `json:"output"`
	FailureReason string          `json:"failure_reason,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	StartedAt     *time.Time      `json:"started_at,omitempty"`
	CompletedAt   *time.Time      `json:"completed_at,omitempty"`
}

type OwnedExecution struct {
	OwnerID uuid.UUID
	Execution
}

type Repository interface {
	CreateOwned(ctx context.Context, ownerID, workflowID, versionID uuid.UUID, input json.RawMessage, now time.Time) (Execution, error)
	GetOwned(ctx context.Context, ownerID, executionID uuid.UUID) (Execution, error)
	ListOwned(ctx context.Context, ownerID, projectID uuid.UUID) ([]Execution, error)
	ListTaskRunsOwned(ctx context.Context, ownerID, executionID uuid.UUID) ([]TaskRun, error)
	LoadRun(ctx context.Context, ownerID, executionID uuid.UUID) (Execution, workflow.Definition, []TaskRun, error)
	ListActive(ctx context.Context) ([]OwnedExecution, error)
	SetExecutionRunning(ctx context.Context, executionID uuid.UUID, startedAt time.Time) error
	SetTaskRunning(ctx context.Context, taskRunID uuid.UUID, startedAt time.Time) error
	SetTaskSucceeded(ctx context.Context, taskRunID uuid.UUID, output json.RawMessage, completedAt time.Time) error
	SetTaskFailed(ctx context.Context, taskRunID uuid.UUID, reason string, completedAt time.Time) error
	SetTaskBlocked(ctx context.Context, taskRunID uuid.UUID, reason string, completedAt time.Time) error
	SetExecutionCompleted(ctx context.Context, executionID uuid.UUID, completedAt time.Time) error
	SetExecutionFailed(ctx context.Context, executionID uuid.UUID, reason string, completedAt time.Time) error
}

type Engine struct {
	repository Repository
	runtime    Runtime
	queue      queue.Repository
	mu         sync.Mutex
	running    map[uuid.UUID]struct{}
}

func NewEngine(repository Repository, runtime Runtime, queues ...queue.Repository) *Engine {
	var taskQueue queue.Repository
	if len(queues) > 0 {
		taskQueue = queues[0]
	}
	return &Engine{repository: repository, runtime: runtime, queue: taskQueue, running: make(map[uuid.UUID]struct{})}
}

func (e *Engine) Start(ctx context.Context, ownerID, executionID uuid.UUID) {
	e.mu.Lock()
	if _, exists := e.running[executionID]; exists {
		e.mu.Unlock()
		return
	}
	e.running[executionID] = struct{}{}
	e.mu.Unlock()
	go func() {
		defer func() { e.mu.Lock(); delete(e.running, executionID); e.mu.Unlock() }()
		_ = e.Run(ctx, ownerID, executionID)
	}()
}

func (e *Engine) Run(ctx context.Context, ownerID, executionID uuid.UUID) error {
	if e.queue != nil {
		return e.runQueued(ctx, ownerID, executionID)
	}
	execution, definition, runs, err := e.repository.LoadRun(ctx, ownerID, executionID)
	if err != nil {
		return err
	}
	if execution.Status == "completed" || execution.Status == "failed" {
		return nil
	}
	if err := e.repository.SetExecutionRunning(ctx, executionID, time.Now().UTC()); err != nil {
		return err
	}
	execution.Status = "running"

	runByTask := make(map[string]TaskRun, len(runs))
	for _, run := range runs {
		runByTask[run.TaskID] = run
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		allSucceeded := true
		for _, task := range definition.Tasks {
			if runByTask[task.ID].Status != "succeeded" {
				allSucceeded = false
				break
			}
		}
		if allSucceeded {
			return e.repository.SetExecutionCompleted(ctx, executionID, time.Now().UTC())
		}

		eligible := make([]workflow.Task, 0)
		for _, task := range definition.Tasks {
			run := runByTask[task.ID]
			if run.Status != "pending" {
				continue
			}
			blocked := false
			ready := true
			for _, dependency := range task.Dependencies {
				dependencyRun := runByTask[dependency]
				if dependencyRun.Status == "failed" || dependencyRun.Status == "blocked" {
					blocked = true
					break
				}
				if dependencyRun.Status != "succeeded" {
					ready = false
				}
			}
			if blocked {
				now := time.Now().UTC()
				if err := e.repository.SetTaskBlocked(ctx, run.ID, "dependency failed", now); err != nil {
					return err
				}
				run.Status = "blocked"
				runByTask[task.ID] = run
				continue
			}
			if ready {
				eligible = append(eligible, task)
			}
		}
		if len(eligible) == 0 {
			return e.repository.SetExecutionFailed(ctx, executionID, "workflow cannot progress", time.Now().UTC())
		}
		var group sync.WaitGroup
		errorsCh := make(chan error, len(eligible))
		for _, task := range eligible {
			run := runByTask[task.ID]
			group.Add(1)
			go func(task workflow.Task, run TaskRun) {
				defer group.Done()
				now := time.Now().UTC()
				if err := e.repository.SetTaskRunning(ctx, run.ID, now); err != nil {
					errorsCh <- err
					return
				}
				output, err := e.runtime.Execute(ctx, task, execution.Input)
				if err != nil {
					errorsCh <- e.repository.SetTaskFailed(ctx, run.ID, err.Error(), time.Now().UTC())
					return
				}
				errorsCh <- e.repository.SetTaskSucceeded(ctx, run.ID, output, time.Now().UTC())
			}(task, run)
		}
		group.Wait()
		close(errorsCh)
		for task := range errorsCh {
			if task != nil {
				return task
			}
		}
		runs, err = e.repository.ListTaskRunsOwned(ctx, ownerID, executionID)
		if err != nil {
			return err
		}
		for _, run := range runs {
			runByTask[run.TaskID] = run
		}
		failed := false
		for _, run := range runs {
			if run.Status == "failed" {
				failed = true
			}
		}
		if failed {
			for _, run := range runs {
				if run.Status == "pending" {
					if err := e.repository.SetTaskBlocked(ctx, run.ID, "dependency failed", time.Now().UTC()); err != nil {
						return err
					}
				}
			}
			return e.repository.SetExecutionFailed(ctx, executionID, "task failed", time.Now().UTC())
		}
	}
}

func (e *Engine) runQueued(ctx context.Context, ownerID, executionID uuid.UUID) error {
	if _, _, _, err := e.repository.LoadRun(ctx, ownerID, executionID); err != nil {
		return err
	}
	if err := e.repository.SetExecutionRunning(ctx, executionID, time.Now().UTC()); err != nil && !strings.Contains(err.Error(), "invalid state transition") {
		return err
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		execution, definition, runs, err := e.repository.LoadRun(ctx, ownerID, executionID)
		if err != nil {
			return err
		}
		if execution.Status == "completed" || execution.Status == "failed" {
			return nil
		}
		byTask := make(map[string]TaskRun, len(runs))
		for _, run := range runs {
			byTask[run.TaskID] = run
		}
		allSucceeded, hasFailed, hasActive := true, false, false
		for _, task := range definition.Tasks {
			status := byTask[task.ID].Status
			if status != "succeeded" {
				allSucceeded = false
			}
			if status == "failed" || status == "blocked" {
				hasFailed = true
			}
			if status == "queued" || status == "running" {
				hasActive = true
			}
		}
		if allSucceeded {
			return e.repository.SetExecutionCompleted(ctx, executionID, time.Now().UTC())
		}
		if hasFailed {
			for _, run := range runs {
				if run.Status == "pending" {
					if err := e.repository.SetTaskBlocked(ctx, run.ID, "dependency failed", time.Now().UTC()); err != nil {
						return err
					}
				}
			}
			return e.repository.SetExecutionFailed(ctx, executionID, "task failed", time.Now().UTC())
		}
		eligible := make([]workflow.Task, 0)
		for _, task := range definition.Tasks {
			run := byTask[task.ID]
			if run.Status != "pending" {
				continue
			}
			ready := true
			for _, dependency := range task.Dependencies {
				if byTask[dependency].Status != "succeeded" {
					ready = false
					break
				}
			}
			if ready {
				eligible = append(eligible, task)
			}
		}
		for _, task := range eligible {
			if err := e.queue.Enqueue(ctx, byTask[task.ID].ID, time.Now().UTC()); err != nil {
				return err
			}
		}
		if len(eligible) == 0 && !hasActive {
			return e.repository.SetExecutionFailed(ctx, executionID, "workflow cannot progress", time.Now().UTC())
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(25 * time.Millisecond):
		}
	}
}

type Runtime interface {
	Execute(context.Context, workflow.Task, json.RawMessage) (json.RawMessage, error)
}

type BuiltinRuntime struct{ client *http.Client }

func NewBuiltinRuntime(client *http.Client) *BuiltinRuntime {
	if client == nil {
		client = http.DefaultClient
	}
	return &BuiltinRuntime{client: client}
}

func (r *BuiltinRuntime) Execute(ctx context.Context, task workflow.Task, input json.RawMessage) (json.RawMessage, error) {
	var config map[string]json.RawMessage
	if err := json.Unmarshal(task.Config, &config); err != nil {
		return nil, fmt.Errorf("invalid task config: %w", err)
	}
	switch task.Type {
	case "transform":
		if output, ok := config["output"]; ok {
			return output, nil
		}
		return task.Config, nil
	case "delay":
		var seconds float64
		if raw, ok := config["seconds"]; ok {
			if err := json.Unmarshal(raw, &seconds); err != nil || seconds < 0 {
				return nil, errors.New("delay seconds must be non-negative")
			}
		}
		timer := time.NewTimer(time.Duration(seconds * float64(time.Second)))
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-timer.C:
			return input, nil
		}
	case "conditional":
		var field, expected string
		_ = json.Unmarshal(config["field"], &field)
		_ = json.Unmarshal(config["equals"], &expected)
		var values map[string]any
		if err := json.Unmarshal(input, &values); err != nil {
			return []byte(`false`), nil
		}
		actual, _ := values[field].(string)
		return json.Marshal(actual == expected)
	default:
		return nil, fmt.Errorf("task type is not executable in Phase 4: %s", task.Type)
	}
}
