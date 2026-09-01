package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/neyati/flowforge/internal/config"
	"github.com/neyati/flowforge/internal/credential"
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
	leaseDuration, err := durationEnv("WORKER_LEASE_DURATION", defaultLeaseDuration)
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}
	heartbeatInterval, err := durationEnv("WORKER_HEARTBEAT_INTERVAL", defaultHeartbeatInterval)
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}
	recoveryInterval, err := durationEnv("WORKER_RECOVERY_INTERVAL", defaultRecoveryInterval)
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}
	if heartbeatInterval >= leaseDuration {
		logger.Error("load configuration", "error", "WORKER_HEARTBEAT_INTERVAL must be less than WORKER_LEASE_DURATION")
		os.Exit(1)
	}
	pool, err := db.Open(context.Background(), cfg.DatabaseURL, cfg.DBConnectTimeout)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	err = (&worker.Worker{
		ID:    workerID,
		Queue: queue.NewPostgresRepository(pool, queue.WithLeaseDuration(leaseDuration)),
		Runtime: execution.NewBuiltinRuntime(nil,
			execution.WithCredentialProvider(credential.EnvSecretProvider{}),
			execution.WithMailer(execution.NewLogMailer(logger)),
		),
		Logger:            logger,
		HeartbeatInterval: heartbeatInterval,
		RecoveryInterval:  recoveryInterval,
	}).Run(ctx)
	if err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}

const (
	defaultLeaseDuration     = 10 * time.Second
	defaultHeartbeatInterval = 2 * time.Second
	defaultRecoveryInterval  = 1 * time.Second
)

func durationEnv(name string, fallback time.Duration) (time.Duration, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		return 0, &invalidDurationError{name: name, raw: raw}
	}
	return value, nil
}

type invalidDurationError struct {
	name string
	raw  string
}

func (e *invalidDurationError) Error() string {
	return "WORKER env " + e.name + " must be a positive duration: " + e.raw
}
