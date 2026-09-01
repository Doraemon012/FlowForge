package scheduler

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/schedule"
)

type Scheduler struct {
	scheduleRepo    schedule.Repository
	executionRepo   execution.Repository
	idempotencyRepo execution.IdempotencyRepository
	workflowRepo    interface {
		GetPublishedVersion(ctx context.Context, projectID, workflowID uuid.UUID) (interface{}, error)
	}
	logger       *slog.Logger
	tickInterval time.Duration
	systemUser   uuid.UUID // System user ID for triggered executions
}

// NewScheduler creates a new scheduler service
func NewScheduler(
	scheduleRepo schedule.Repository,
	executionRepo execution.Repository,
	idempotencyRepo execution.IdempotencyRepository,
	logger *slog.Logger,
) *Scheduler {
	return &Scheduler{
		scheduleRepo:    scheduleRepo,
		executionRepo:   executionRepo,
		idempotencyRepo: idempotencyRepo,
		logger:          logger,
		tickInterval:    10 * time.Second,
		systemUser:      uuid.Nil, // Will be set at runtime
	}
}

// Run starts the scheduler loop (blocks until ctx is cancelled)
func (s *Scheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(s.tickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("scheduler stopped")
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	now := time.Now()

	// Find all schedules that are due
	schedules, err := s.scheduleRepo.FindDueSchedules(ctx, now)
	if err != nil {
		s.logger.Error("find due schedules", "error", err)
		return
	}

	for _, sched := range schedules {
		// Create execution with idempotency key based on schedule ID and occurrence time
		idempotencyKey := scheduleIdempotencyKey(sched.ID, now)

		// Check if already triggered (idempotency)
		_, err := s.idempotencyRepo.GetExecutionByIdempotencyKey(ctx, sched.ProjectID, idempotencyKey)
		if err == nil {
			// Already triggered, mark as triggered and skip
			if err := s.scheduleRepo.MarkTriggered(ctx, sched.ID, now); err != nil {
				s.logger.Error("mark schedule triggered", "schedule_id", sched.ID, "error", err)
			}
			continue
		} else if err != execution.ErrIdempotencyNotFound {
			// Real error checking idempotency
			s.logger.Error("check idempotency", "schedule_id", sched.ID, "error", err)
			continue
		}

		// Create execution
		input := json.RawMessage(`{}`)
		execRecord, err := s.executionRepo.CreateOwned(ctx, sched.ProjectID, sched.WorkflowID, uuid.Nil, input, now)
		if err != nil {
			s.logger.Error("create execution for schedule",
				"schedule_id", sched.ID,
				"workflow_id", sched.WorkflowID,
				"error", err)
			continue
		}

		// Record idempotency key
		if err := s.idempotencyRepo.RecordIdempotencyKey(ctx, sched.ProjectID, execRecord.ID, idempotencyKey, now); err != nil {
			s.logger.Error("record idempotency", "schedule_id", sched.ID, "error", err)
			continue
		}

		// Mark schedule as triggered
		if err := s.scheduleRepo.MarkTriggered(ctx, sched.ID, now); err != nil {
			s.logger.Error("mark schedule triggered", "schedule_id", sched.ID, "error", err)
			continue
		}

		s.logger.Info("schedule triggered", "schedule_id", sched.ID, "workflow_id", sched.WorkflowID, "execution_id", execRecord.ID)
	}
}

// scheduleIdempotencyKey generates a deterministic idempotency key for a schedule occurrence
// Using the schedule ID and a time bucket (minute granularity) ensures that multiple
// scheduler runs in the same minute are deduplicated
func scheduleIdempotencyKey(scheduleID uuid.UUID, now time.Time) string {
	// Use minute granularity for idempotency key to handle scheduler retries within same minute
	bucket := now.Truncate(time.Minute)
	return "schedule:" + scheduleID.String() + ":" + bucket.Format(time.RFC3339)
}
