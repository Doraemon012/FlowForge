package worker

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/observ"
	"github.com/neyati/flowforge/internal/queue"
)

const (
	defaultHeartbeatInterval = 2 * time.Second
	defaultRecoveryInterval  = 1 * time.Second
	defaultClaimPollInterval = 50 * time.Millisecond
)

// classifyingQueue is implemented by queue backends that can record a failure
// classification alongside the failure reason. Workers fall back to the plain
// Fail contract when the queue does not support it.
type classifyingQueue interface {
	FailClassified(ctx context.Context, taskRunID uuid.UUID, workerID, leaseToken string, attempt int, reason, classification string, now time.Time) error
}

type Worker struct {
	ID      string
	Queue   queue.Repository
	Runtime execution.Runtime
	Logger  *slog.Logger
	// Recorder appends domain lifecycle events. It is optional; when nil the
	// worker still logs to its structured logger but does not persist events.
	Recorder observ.Recorder
	// Logs appends persisted structured log entries. It is optional; when nil
	// the worker still logs to its structured logger but does not persist them.
	Logs observ.LogRecorder
	// HeartbeatInterval controls how often a claimed task's lease is renewed.
	// It must stay comfortably below the queue's lease duration so a healthy
	// worker never loses ownership.
	HeartbeatInterval time.Duration
	// RecoveryInterval controls how often this worker sweeps the queue for
	// expired leases left behind by dead workers.
	RecoveryInterval time.Duration
	claimPoll        time.Duration
}

func (w *Worker) Run(ctx context.Context) error {
	logger := w.logger()
	logger.Info("worker started", "worker_id", w.ID)

	runCtx, cancelRun := context.WithCancel(ctx)
	defer cancelRun()
	go w.recoverExpiredLeases(runCtx, logger)

	poll := w.claimPoll
	if poll <= 0 {
		poll = defaultClaimPollInterval
	}
	for {
		work, err := w.Queue.Claim(runCtx, w.ID, time.Now().UTC())
		if errors.Is(err, queue.ErrNoWork) {
			select {
			case <-runCtx.Done():
				logger.Info("worker stopped", "worker_id", w.ID)
				return nil
			case <-time.After(poll):
				continue
			}
		}
		if err != nil {
			return err
		}
		w.execute(runCtx, work, logger)
	}
}

// execute runs one claimed attempt under its bounded lease. Ownership is
// enforced end to end: heartbeats renew the lease while the task runs, losing
// the lease cancels execution, and the final result is reported through the
// fenced queue API so a stale worker can never overwrite newer state.
func (w *Worker) execute(ctx context.Context, work queue.Work, logger *slog.Logger) {
	logFields := []any{
		"worker_id", w.ID,
		"execution_id", work.ExecutionID,
		"task_run_id", work.TaskRunID,
		"task_id", work.Task.ID,
		"attempt", work.Attempt,
	}
	logger.Info("task claimed", logFields...)
	w.recordEvent(work, "task_claimed", nil)
	w.recordLog(work, "info", "worker", "task claimed")

	taskCtx, cancelTask := context.WithCancel(ctx)
	heartbeatDone := make(chan struct{})
	go w.heartbeatLoop(taskCtx, work, cancelTask, logger, heartbeatDone)

	output, taskErr := w.Runtime.Execute(taskCtx, work.Task, work.Input)
	cancelTask()
	<-heartbeatDone

	if taskErr != nil {
		if ctx.Err() != nil {
			// The worker itself is shutting down, not the task failing. Leave
			// the lease to expire so recovery can reassign the work instead of
			// recording a false failure.
			logger.Info("task abandoned for shutdown", append(logFields, "error", taskErr)...)
			return
		}
		logger.Error("task failed", append(logFields, "error", taskErr)...)
		w.reportFailure(ctx, work, taskErr, logFields, logger)
		return
	}
	logger.Info("task succeeded", logFields...)
	w.reportResult(ctx, work, func(now time.Time) error {
		return w.Queue.Complete(context.Background(), work.TaskRunID, work.WorkerID, work.LeaseToken, work.Attempt, output, now)
	}, "succeeded", logFields, logger)
}

func (w *Worker) reportFailure(ctx context.Context, work queue.Work, taskErr error, logFields []any, logger *slog.Logger) {
	classification := "terminal"
	if execution.IsRetryable(taskErr) {
		classification = "transient"
	}
	w.recordEvent(work, "task_failed", map[string]any{"error": taskErr.Error(), "classification": classification})
	w.recordLog(work, "error", "worker", "task failed: "+taskErr.Error())
	w.reportResult(ctx, work, func(now time.Time) error {
		if cq, ok := w.Queue.(classifyingQueue); ok {
			return cq.FailClassified(context.Background(), work.TaskRunID, work.WorkerID, work.LeaseToken, work.Attempt, taskErr.Error(), classification, now)
		}
		return w.Queue.Fail(context.Background(), work.TaskRunID, work.WorkerID, work.LeaseToken, work.Attempt, taskErr.Error(), now)
	}, "failed", logFields, logger)
}

func (w *Worker) reportResult(ctx context.Context, work queue.Work, report func(time.Time) error, outcome string, logFields []any, logger *slog.Logger) {
	err := report(time.Now().UTC())
	switch {
	case err == nil:
		if outcome == "succeeded" {
			w.recordEvent(work, "task_succeeded", nil)
			w.recordLog(work, "info", "worker", "task succeeded")
		}
		return
	case errors.Is(err, queue.ErrLeaseNotOwned):
		// Stale worker protection: another worker recovered and re-ran the
		// task after our lease expired. Our late result must be dropped, and
		// it must never overwrite the newer owner's state.
		logger.Warn("stale result discarded; lease no longer owned", append(logFields, "outcome", outcome)...)
		w.recordEvent(work, "stale_result_discarded", map[string]any{"outcome": outcome})
		w.recordLog(work, "warn", "worker", "stale result discarded")
	case ctx.Err() != nil:
		logger.Warn("result report interrupted by shutdown", append(logFields, "outcome", outcome, "error", err)...)
	default:
		logger.Error("result report failed", append(logFields, "outcome", outcome, "error", err)...)
	}
}

// heartbeatLoop renews the lease at a bounded interval until execution ends.
// Losing ownership definitively cancels the task context so the worker stops
// doing work it no longer owns.
func (w *Worker) heartbeatLoop(taskCtx context.Context, work queue.Work, cancelTask context.CancelFunc, logger *slog.Logger, done chan struct{}) {
	defer close(done)
	interval := w.HeartbeatInterval
	if interval <= 0 {
		interval = defaultHeartbeatInterval
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	fields := []any{
		"worker_id", w.ID,
		"execution_id", work.ExecutionID,
		"task_run_id", work.TaskRunID,
		"task_id", work.Task.ID,
		"attempt", work.Attempt,
	}
	for {
		select {
		case <-taskCtx.Done():
			return
		case <-ticker.C:
			err := w.Queue.Heartbeat(context.Background(), work.TaskRunID, work.WorkerID, work.LeaseToken, time.Now().UTC())
			switch {
			case err == nil:
				// Lease renewed.
			case errors.Is(err, queue.ErrLeaseNotOwned):
				logger.Warn("lease lost; cancelling task execution", fields...)
				w.recordEvent(work, "lease_lost", map[string]any{"reason": err.Error()})
				w.recordLog(work, "warn", "worker", "lease lost; cancelling task execution")
				cancelTask()
				return
			default:
				// Transient database failure: retry on the next tick. If the
				// lease truly expires the fenced result report will reject us.
				logger.Error("task heartbeat failed", append(fields, "error", err)...)
			}
		}
	}
}

// recoverExpiredLeases periodically reclaims work abandoned by dead workers.
// Every worker runs the sweep; concurrent sweeps are safe because expired
// rows are selected FOR UPDATE SKIP LOCKED and transitions are conditional.
func (w *Worker) recoverExpiredLeases(ctx context.Context, logger *slog.Logger) {
	interval := w.RecoveryInterval
	if interval <= 0 {
		interval = defaultRecoveryInterval
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			recovered, err := w.Queue.RecoverExpired(ctx, time.Now().UTC())
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				logger.Error("lease recovery sweep failed", "worker_id", w.ID, "error", err)
				continue
			}
			if recovered > 0 {
				logger.Info("expired leases recovered", "worker_id", w.ID, "count", recovered)
			}
		}
	}
}

// recordEvent appends a lifecycle event if a recorder is configured.
func (w *Worker) recordEvent(work queue.Work, eventType string, metadata any) {
	if w.Recorder == nil {
		return
	}
	var raw json.RawMessage
	if metadata == nil {
		raw = json.RawMessage(`{}`)
	} else if encoded, err := json.Marshal(metadata); err == nil {
		raw = encoded
	}
	taskRunID := work.TaskRunID
	taskAttemptID := work.TaskAttemptID
	_ = w.Recorder.Record(context.Background(), observ.Event{
		ProjectID:     work.ProjectID,
		ExecutionID:   work.ExecutionID,
		TaskID:        work.Task.ID,
		TaskRunID:     &taskRunID,
		TaskAttemptID: &taskAttemptID,
		WorkerID:      w.ID,
		EventType:     eventType,
		CreatedAt:     time.Now().UTC(),
		Metadata:      raw,
	})
}

// recordLog appends a persisted structured log entry if a log recorder is
// configured. Callers must redact secrets before passing the message.
func (w *Worker) recordLog(work queue.Work, severity, source, message string) {
	if w.Logs == nil {
		return
	}
	taskRunID := work.TaskRunID
	taskAttemptID := work.TaskAttemptID
	_ = w.Logs.RecordLog(context.Background(), observ.LogEntry{
		ProjectID:     work.ProjectID,
		ExecutionID:   work.ExecutionID,
		TaskID:        work.Task.ID,
		TaskRunID:     &taskRunID,
		TaskAttemptID: &taskAttemptID,
		WorkerID:      w.ID,
		Severity:      severity,
		Source:        source,
		Message:       message,
		CreatedAt:     time.Now().UTC(),
	})
}

func (w *Worker) logger() *slog.Logger {
	if w.Logger != nil {
		return w.Logger
	}
	return slog.Default()
}
