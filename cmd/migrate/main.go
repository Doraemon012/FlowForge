package main

import (
	"log/slog"
	"os"

	"github.com/neyati/flowforge/internal/db"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		// CI and integration setups conventionally set INTEGRATION_DATABASE_URL
		// instead of DATABASE_URL. Migrations only need the database connection,
		// so falling back keeps a clean CI environment free of the control-plane
		// config (HTTP_ADDR/TOKEN_SECRET) that cmd/migrate does not use.
		databaseURL = os.Getenv("INTEGRATION_DATABASE_URL")
	}
	if databaseURL == "" {
		slog.Error("migrate requires DATABASE_URL in the environment")
		os.Exit(1)
	}
	if err := db.Migrate(databaseURL); err != nil {
		slog.Error("run migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")
}
