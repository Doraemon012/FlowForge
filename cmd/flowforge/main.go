package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/config"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/httpapi"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/queue"
	"github.com/neyati/flowforge/internal/schedule"
	"github.com/neyati/flowforge/internal/scheduler"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/webhook"
	"github.com/neyati/flowforge/internal/workflow"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}

	pool, err := db.Open(context.Background(), cfg.DatabaseURL, cfg.DBConnectTimeout)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	executionRepository := execution.NewPostgresRepository(pool)
	taskQueue := queue.NewPostgresRepository(pool)
	scheduleRepository := schedule.NewPostgresRepository(pool)
	webhookRepository := webhook.NewPostgresRepository(pool)
	idempotencyRepository := execution.NewPostgresIdempotencyRepository(pool)

	executionEngine := execution.NewEngine(executionRepository, execution.NewBuiltinRuntime(nil), taskQueue)
	activeExecutions, err := executionRepository.ListActive(context.Background())
	if err != nil {
		logger.Error("reconcile active executions", "error", err)
		os.Exit(1)
	}
	for _, active := range activeExecutions {
		executionEngine.Start(context.Background(), active.OwnerID, active.ID)
	}

	// Create scheduler service
	schedulerService := scheduler.NewScheduler(scheduleRepository, executionRepository, idempotencyRepository, workflow.NewPostgresRepository(pool), project.NewPostgresRepository(pool), logger)

	server := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: httpapi.NewExecutionServer(
			pool,
			user.NewPostgresRepository(pool),
			project.NewPostgresRepository(pool),
			workflow.NewPostgresRepository(pool),
			executionRepository,
			executionEngine,
			auth.NewTokenService(cfg.TokenSecret),
			scheduleRepository,
			webhookRepository,
			idempotencyRepository,
			logger,
		).Router(),
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("server listening", "addr", cfg.HTTPAddr)
		serverErrors <- server.ListenAndServe()
	}()

	// Start scheduler in background
	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	go schedulerService.Run(schedulerCtx)

	shutdown, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server stopped", "error", err)
			os.Exit(1)
		}
	case <-shutdown.Done():
		schedulerCancel()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			logger.Error("server shutdown", "error", err)
			os.Exit(1)
		}
		logger.Info("server stopped")
	}
}
