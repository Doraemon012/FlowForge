package config

import "testing"

func TestLoadValidConfig(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("DB_CONNECT_TIMEOUT", "2s")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.DatabaseURL != "postgres://localhost/flowforge" || cfg.HTTPAddr != ":8080" || cfg.DBConnectTimeout.Seconds() != 2 {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestLoadRejectsMissingRequiredVariable(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for missing DATABASE_URL")
	}
}

func TestLoadRejectsInvalidTimeout(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("DB_CONNECT_TIMEOUT", "0s")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for invalid DB_CONNECT_TIMEOUT")
	}
}

func TestLoadRejectsInvalidDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "not-a-database-url")
	t.Setenv("HTTP_ADDR", ":8080")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for invalid DATABASE_URL")
	}
}

func TestLoadRejectsInvalidHTTPAddress(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", "8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for invalid HTTP_ADDR")
	}
}
