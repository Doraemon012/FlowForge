package worker

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/queue"
)

type Worker struct {
	ID         string
	Queue      queue.Repository
	Executions execution.Repository
	Runtime    execution.Runtime
	Logger     *slog.Logger
}

func (w *Worker) Run(ctx context.Context) error {
	logger := w.Logger
	if logger == nil {
		logger = slog.Default()
	}
	logger.Info("worker started", "worker_id", w.ID)
	for {
		work, err := w.Queue.Claim(ctx, w.ID, time.Now().UTC())
		if errors.Is(err, queue.ErrNoWork) {
			select {
			case <-ctx.Done():
				logger.Info("worker stopped", "worker_id", w.ID)
				return nil
			case <-time.After(50 * time.Millisecond):
				continue
			}
		}
		if err != nil {
			return err
		}
		logger.Info("task claimed", "worker_id", w.ID, "task_run_id", work.TaskRunID, "execution_id", work.ExecutionID, "task_id", work.Task.ID)
		output, taskErr := w.Runtime.Execute(context.Background(), work.Task, work.Input)
		if taskErr != nil {
			logger.Error("task failed", "worker_id", w.ID, "task_run_id", work.TaskRunID, "execution_id", work.ExecutionID, "task_id", work.Task.ID, "error", taskErr)
			if err := w.Executions.SetTaskFailed(context.Background(), work.TaskRunID, taskErr.Error(), time.Now().UTC()); err != nil {
				return err
			}
			if err := w.Queue.Fail(context.Background(), work.TaskRunID, w.ID, time.Now().UTC()); err != nil {
				return err
			}
			continue
		}
		logger.Info("task completed", "worker_id", w.ID, "task_run_id", work.TaskRunID, "execution_id", work.ExecutionID, "task_id", work.Task.ID)
		if err := w.Executions.SetTaskSucceeded(context.Background(), work.TaskRunID, output, time.Now().UTC()); err != nil {
			return err
		}
		if err := w.Queue.Complete(context.Background(), work.TaskRunID, w.ID, time.Now().UTC()); err != nil {
			return err
		}
	}
}
