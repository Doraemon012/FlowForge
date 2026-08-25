package db

import (
	"os"
	"testing"
)

func TestMigrationsAgainstPostgres(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := Migrate(databaseURL); err != nil {
		t.Fatalf("first migration: %v", err)
	}
	if err := Migrate(databaseURL); err != nil {
		t.Fatalf("migration rerun: %v", err)
	}
}
