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

func TestLoadRateLimitDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	// Deliberately unset the limit variables to exercise the defaults.
	t.Setenv("MAX_BODY_BYTES", "")
	t.Setenv("AUTH_RATE_LIMIT_RPS", "")
	t.Setenv("AUTH_RATE_LIMIT_BURST", "")
	t.Setenv("WEBHOOK_RATE_LIMIT_RPS", "")
	t.Setenv("WEBHOOK_RATE_LIMIT_BURST", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.MaxBodyBytes != 1<<20 {
		t.Fatalf("MaxBodyBytes = %d, want %d", cfg.MaxBodyBytes, 1<<20)
	}
	if cfg.AuthRateLimitRPS != 10 || cfg.AuthRateLimitBurst != 20 {
		t.Fatalf("auth limits = (%d,%d), want (10,20)", cfg.AuthRateLimitRPS, cfg.AuthRateLimitBurst)
	}
	if cfg.WebhookRateLimitRPS != 20 || cfg.WebhookRateLimitBurst != 40 {
		t.Fatalf("webhook limits = (%d,%d), want (20,40)", cfg.WebhookRateLimitRPS, cfg.WebhookRateLimitBurst)
	}
}

func TestLoadCustomRateLimits(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("MAX_BODY_BYTES", "2048")
	t.Setenv("AUTH_RATE_LIMIT_RPS", "5")
	t.Setenv("AUTH_RATE_LIMIT_BURST", "7")
	t.Setenv("WEBHOOK_RATE_LIMIT_RPS", "12")
	t.Setenv("WEBHOOK_RATE_LIMIT_BURST", "24")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.MaxBodyBytes != 2048 {
		t.Fatalf("MaxBodyBytes = %d, want 2048", cfg.MaxBodyBytes)
	}
	if cfg.AuthRateLimitRPS != 5 || cfg.AuthRateLimitBurst != 7 {
		t.Fatalf("auth limits = (%d,%d), want (5,7)", cfg.AuthRateLimitRPS, cfg.AuthRateLimitBurst)
	}
	if cfg.WebhookRateLimitRPS != 12 || cfg.WebhookRateLimitBurst != 24 {
		t.Fatalf("webhook limits = (%d,%d), want (12,24)", cfg.WebhookRateLimitRPS, cfg.WebhookRateLimitBurst)
	}
}

func TestLoadRejectsInvalidMaxBodyBytes(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("MAX_BODY_BYTES", "0")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for MAX_BODY_BYTES=0")
	}
}

func TestLoadRejectsInvalidAuthRateLimit(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("AUTH_RATE_LIMIT_RPS", "-1")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for negative AUTH_RATE_LIMIT_RPS")
	}
}

func TestLoadRejectsInvalidAuthBurst(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("AUTH_RATE_LIMIT_BURST", "0")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for AUTH_RATE_LIMIT_BURST=0")
	}
}

func TestLoadRejectsInvalidWebhookRateLimit(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("WEBHOOK_RATE_LIMIT_RPS", "-1")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for negative WEBHOOK_RATE_LIMIT_RPS")
	}
}

func TestLoadRejectsInvalidWebhookBurst(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("WEBHOOK_RATE_LIMIT_BURST", "0")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for WEBHOOK_RATE_LIMIT_BURST=0")
	}
}
func TestLoadAIConfig(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	t.Setenv("FLOWFORGE_AI_PROVIDER", "cohere")
	t.Setenv("FLOWFORGE_OPENAI_API_KEY", "openai-key")
	t.Setenv("FLOWFORGE_OPENAI_BASE_URL", "https://openai.example/v1")
	t.Setenv("FLOWFORGE_OPENAI_MODEL", "gpt-4o-mini")
	t.Setenv("FLOWFORGE_COHERE_API_KEY", "cohere-key")
	t.Setenv("FLOWFORGE_COHERE_BASE_URL", "https://cohere.example")
	t.Setenv("FLOWFORGE_COHERE_MODEL", "command-r-plus-08-2024")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AIProvider != "cohere" {
		t.Fatalf("AIProvider = %q, want %q", cfg.AIProvider, "cohere")
	}
	if cfg.OpenAIAPIKey != "openai-key" || cfg.OpenAIBaseURL != "https://openai.example/v1" || cfg.OpenAIModel != "gpt-4o-mini" {
		t.Fatalf("unexpected OpenAI settings: %+v", cfg)
	}
	if cfg.CohereAPIKey != "cohere-key" || cfg.CohereBaseURL != "https://cohere.example" || cfg.CohereModel != "command-r-plus-08-2024" {
		t.Fatalf("unexpected Cohere settings: %+v", cfg)
	}
}

func TestLoadAIProviderDefaultsToEmpty(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/flowforge")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("TOKEN_SECRET", "01234567890123456789012345678901")
	// Unset AI settings; Load must succeed and leave them empty so the ai
	// package can apply its own default provider and report AI as disabled.
	t.Setenv("FLOWFORGE_AI_PROVIDER", "")
	t.Setenv("FLOWFORGE_OPENAI_API_KEY", "")
	t.Setenv("FLOWFORGE_COHERE_API_KEY", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AIProvider != "" || cfg.OpenAIAPIKey != "" || cfg.CohereAPIKey != "" {
		t.Fatalf("expected empty AI settings, got %+v", cfg)
	}
}
