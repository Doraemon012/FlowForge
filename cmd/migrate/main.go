package main

import (
	"log/slog"
	"os"

	"github.com/neyati/flowforge/internal/config"
	"github.com/neyati/flowforge/internal/db"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("load configuration", "error", err)
		os.Exit(1)
	}
	if err := db.Migrate(cfg.DatabaseURL); err != nil {
		slog.Error("run migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")
}
