package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neyati/flowforge/internal/db"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	days := flag.Int("days", 30, "retention window in days")
	flag.Parse()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		logger.Error("retention requires DATABASE_URL in the environment")
		os.Exit(1)
	}
	if *days < 1 {
		logger.Error("retention window must be a positive integer", "days", *days)
		os.Exit(1)
	}

	connectTimeout := 5 * time.Second
	if raw := os.Getenv("DB_CONNECT_TIMEOUT"); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil && parsed > 0 {
			connectTimeout = parsed
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := db.Open(ctx, databaseURL, connectTimeout)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	cutoff := time.Now().UTC().AddDate(0, 0, -*days)

	deletedEvents := deleteByCreatedAt(ctx, pool, "execution_events", cutoff)
	deletedLogs := deleteByCreatedAt(ctx, pool, "log_entries", cutoff)
	deletedAttempts := deleteCompletedAttempts(ctx, pool, cutoff)
	deletedIdempotency := deleteIdempotency(ctx, pool, cutoff)

	logger.Info("retention cleanup complete",
		"days", *days,
		"cutoff", cutoff,
		"deleted_events", deletedEvents,
		"deleted_logs", deletedLogs,
		"deleted_attempts", deletedAttempts,
		"deleted_idempotency", deletedIdempotency,
	)
}

// deleteByCreatedAt prunes rows from a table whose created_at is older than
// the cutoff. It returns the number of rows removed.
func deleteByCreatedAt(ctx context.Context, pool *pgxpool.Pool, table string, cutoff time.Time) int64 {
	// Only known append-only tables with a created_at column are eligible.
	if table != "execution_events" && table != "log_entries" {
		return 0
	}
	tag, err := pool.Exec(ctx, `DELETE FROM `+table+` WHERE created_at < $1`, cutoff)
	if err != nil {
		slog.Error("retention delete failed", "table", table, "error", err)
		return 0
	}
	return tag.RowsAffected()
}

// deleteCompletedAttempts prunes task attempt history whose parent execution
// completed before the cutoff. Attempts for still-running executions are left
// untouched so an active workflow's recovery history is not destroyed.
func deleteCompletedAttempts(ctx context.Context, pool *pgxpool.Pool, cutoff time.Time) int64 {
	tag, err := pool.Exec(ctx, `
		DELETE FROM task_attempts a
		USING task_runs tr, executions e
		WHERE a.task_run_id = tr.id
		  AND tr.execution_id = e.id
		  AND e.completed_at IS NOT NULL
		  AND e.completed_at < $1
	`, cutoff)
	if err != nil {
		slog.Error("retention delete failed", "table", "task_attempts", "error", err)
		return 0
	}
	return tag.RowsAffected()
}

// deleteIdempotency prunes idempotency rows whose parent execution completed
// before the cutoff, plus any truly orphaned rows whose execution no longer
// exists (e.g. after a project-scoped cleanup removed the execution). This
// bounds the growth of the lookup table without touching rows for active
// executions that might still be retried.
func deleteIdempotency(ctx context.Context, pool *pgxpool.Pool, cutoff time.Time) int64 {
	tag, err := pool.Exec(ctx, `
		DELETE FROM execution_idempotency i
		WHERE NOT EXISTS (SELECT 1 FROM executions e WHERE e.id = i.execution_id)
		   OR EXISTS (
		       SELECT 1 FROM executions e
		       WHERE e.id = i.execution_id
		         AND e.completed_at IS NOT NULL
		         AND e.completed_at < $1
		   )
	`, cutoff)
	if err != nil {
		slog.Error("retention delete failed", "table", "execution_idempotency", "error", err)
		return 0
	}
	return tag.RowsAffected()
}
