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

type WorkflowRepository interface {
	GetActiveVersion(ctx context.Context, workflowID uuid.UUID) (uuid.UUID, error)
}

type ProjectRepository interface {
	GetOwner(ctx context.Context, projectID uuid.UUID) (uuid.UUID, error)
}

// ExecutionStarter launches an execution's orchestrator loop. The API server's
// execution engine implements this; the scheduler uses it so that scheduled
// runs flow through the same orchestration path as manual/API triggers.
type ExecutionStarter interface {
	Start(ctx context.Context, ownerID, executionID uuid.UUID)
}

type Scheduler struct {
	scheduleRepo    schedule.Repository
	executionRepo   execution.Repository
	idempotencyRepo execution.IdempotencyRepository
	workflowRepo    WorkflowRepository
	projectRepo     ProjectRepository
	starter         ExecutionStarter
	logger          *slog.Logger
	tickInterval    time.Duration
	now             func() time.Time
}

// NewScheduler creates a new scheduler service. The starter is required so a
// due schedule that creates an execution is immediately orchestrated; a nil
// starter disables execution dispatch for tests that only inspect persistence.
func NewScheduler(
	scheduleRepo schedule.Repository,
	executionRepo execution.Repository,
	idempotencyRepo execution.IdempotencyRepository,
	workflowRepo WorkflowRepository,
	projectRepo ProjectRepository,
	starter ExecutionStarter,
	logger *slog.Logger,
) *Scheduler {
	return &Scheduler{
		scheduleRepo:    scheduleRepo,
		executionRepo:   executionRepo,
		idempotencyRepo: idempotencyRepo,
		workflowRepo:    workflowRepo,
		projectRepo:     projectRepo,
		starter:         starter,
		logger:          logger,
		tickInterval:    10 * time.Second,
		now:             time.Now,
	}
}

// Run starts the scheduler loop and blocks until ctx is cancelled.
func (s *Scheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(s.tickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("scheduler stopped")
			return
		case <-ticker.C:
			s.Tick(ctx)
		}
	}
}

// Tick processes all currently-due schedules exactly once. Exposing it
// separately from Run makes the scheduler unit/integration testable without
// waiting on a real tick interval.
func (s *Scheduler) Tick(ctx context.Context) {
	now := s.now()

	schedules, err := s.scheduleRepo.FindDueSchedules(ctx, now)
	if err != nil {
		s.logger.Error("find due schedules", "error", err)
		return
	}

	for _, sched := range schedules {
		s.processSchedule(ctx, sched, now)
	}
}

func (s *Scheduler) processSchedule(ctx context.Context, sched schedule.Schedule, now time.Time) {
	// A schedule only fires when its workflow has an active published version.
	versionID, err := s.workflowRepo.GetActiveVersion(ctx, sched.WorkflowID)
	if err != nil {
		s.logger.Warn("schedule skipped; workflow has no active version",
			"schedule_id", sched.ID, "workflow_id", sched.WorkflowID, "error", err)
		s.advanceSchedule(ctx, sched)
		return
	}

	// The execution needs the project owner to satisfy the ownership check.
	ownerID, err := s.projectRepo.GetOwner(ctx, sched.ProjectID)
	if err != nil {
		s.logger.Error("schedule skipped; project owner lookup failed",
			"schedule_id", sched.ID, "project_id", sched.ProjectID, "error", err)
		s.advanceSchedule(ctx, sched)
		return
	}

	// Idempotency is anchored to the precise scheduled occurrence, not the
	// tick time, so a retried/overlapping tick cannot double-fire one
	// occurrence while still allowing the NEXT occurrence to fire later.
	occurrenceKey := scheduleOccurrenceKey(sched.ID, *sched.NextOccurrence)
	_, err = s.idempotencyRepo.GetExecutionByIdempotencyKey(ctx, sched.ProjectID, occurrenceKey)
	if err == nil {
		// Occurrence already processed; just move next_occurrence forward.
		s.advanceSchedule(ctx, sched)
		return
	} else if err != execution.ErrIdempotencyNotFound {
		s.logger.Error("schedule idempotency check failed",
			"schedule_id", sched.ID, "error", err)
		s.advanceSchedule(ctx, sched)
		return
	}

	input := json.RawMessage(`{}`)
	execRecord, err := s.executionRepo.CreateOwned(ctx, ownerID, sched.WorkflowID, versionID, input, now)
	if err != nil {
		s.logger.Error("create execution for schedule",
			"schedule_id", sched.ID, "workflow_id", sched.WorkflowID, "error", err)
		s.advanceSchedule(ctx, sched)
		return
	}

	if err := s.idempotencyRepo.RecordIdempotencyKey(ctx, sched.ProjectID, execRecord.ID, occurrenceKey, now); err != nil {
		s.logger.Error("record schedule idempotency", "schedule_id", sched.ID, "error", err)
	}

	if err := s.scheduleRepo.MarkTriggered(ctx, sched.ID, now); err != nil {
		s.logger.Error("mark schedule triggered", "schedule_id", sched.ID, "error", err)
	}

	// A scheduled run must be orchestrated immediately, not just persisted,
	// otherwise it would sit in pending until the API process restarts.
	if s.starter != nil {
		s.starter.Start(ctx, ownerID, execRecord.ID)
	}

	s.advanceSchedule(ctx, sched)
	s.logger.Info("schedule triggered",
		"schedule_id", sched.ID, "workflow_id", sched.WorkflowID, "execution_id", execRecord.ID)
}

// advanceSchedule moves next_occurrence to the next future occurrence after
// now. This implements the V1 missed-occurrence policy: an overdue schedule
// fires at most once on the tick that catches it, then resumes its regular
// cadence from the next future slot (rather than replaying every missed run).
func (s *Scheduler) advanceSchedule(ctx context.Context, sched schedule.Schedule) {
	next, err := schedule.ComputeNextOccurrence(sched.CronExpression, sched.Timezone, s.now())
	if err != nil {
		s.logger.Error("compute next occurrence", "schedule_id", sched.ID, "error", err)
		return
	}
	if err := s.scheduleRepo.SetNextOccurrence(ctx, sched.ID, &next, s.now()); err != nil {
		s.logger.Error("advance schedule next occurrence", "schedule_id", sched.ID, "error", err)
	}
}

func scheduleOccurrenceKey(scheduleID uuid.UUID, occurrence time.Time) string {
	return "schedule:" + scheduleID.String() + ":" + occurrence.UTC().Format(time.RFC3339)
}
