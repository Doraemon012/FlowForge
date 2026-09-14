package config

import (
	"testing"
	"time"
)

// setRequiredEnv populates the three variables Load() hard-requires so the
// optional deployment variables can be exercised in isolation.
func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/flowforge?sslmode=disable")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "0123456789abcdef0123456789abcdef")
}

func TestLoadParsesCORSOrigins(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://app.example.com , *.azurestaticapps.net , ")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	want := []string{"https://app.example.com", "*.azurestaticapps.net"}
	if len(cfg.CORSAllowedOrigins) != len(want) {
		t.Fatalf("CORSAllowedOrigins = %v, want %v", cfg.CORSAllowedOrigins, want)
	}
	for i := range want {
		if cfg.CORSAllowedOrigins[i] != want[i] {
			t.Fatalf("CORSAllowedOrigins[%d] = %q, want %q", i, cfg.CORSAllowedOrigins[i], want[i])
		}
	}
}

func TestLoadCORSEmptyYieldsNil(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.CORSAllowedOrigins != nil {
		t.Fatalf("CORSAllowedOrigins = %v, want nil when unset", cfg.CORSAllowedOrigins)
	}
}

func TestLoadRecoveryIntervalDefaultAndOverride(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.RecoveryInterval != 5*time.Second {
		t.Fatalf("RecoveryInterval default = %v, want 5s", cfg.RecoveryInterval)
	}

	t.Setenv("CONTROL_PLANE_RECOVERY_INTERVAL", "2s")
	cfg, err = Load()
	if err != nil {
		t.Fatalf("Load() with override error = %v", err)
	}
	if cfg.RecoveryInterval != 2*time.Second {
		t.Fatalf("RecoveryInterval = %v, want 2s", cfg.RecoveryInterval)
	}
}

func TestLoadRejectsInvalidRecoveryInterval(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("CONTROL_PLANE_RECOVERY_INTERVAL", "not-a-duration")

	if _, err := Load(); err == nil {
		t.Fatal("Load() = nil error, want an error for an invalid CONTROL_PLANE_RECOVERY_INTERVAL")
	}
}
