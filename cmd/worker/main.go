package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/neyati/flowforge/internal/config"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}
	workerID := os.Getenv("WORKER_ID")
	if workerID == "" {
		logger.Error("load configuration", "error", "WORKER_ID is required")
		os.Exit(1)
	}
	pool, err := db.Open(context.Background(), cfg.DatabaseURL, cfg.DBConnectTimeout)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	executionRepository := execution.NewPostgresRepository(pool)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	err = (&worker.Worker{ID: workerID, Queue: queue.NewPostgresRepository(pool), Executions: executionRepository, Runtime: execution.NewBuiltinRuntime(nil), Logger: logger}).Run(ctx)
	if err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}
