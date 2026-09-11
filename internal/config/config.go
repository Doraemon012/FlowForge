package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL           string
	HTTPAddr              string
	DBConnectTimeout      time.Duration
	TokenSecret           string
	MaxBodyBytes          int64
	AuthRateLimitRPS      int
	AuthRateLimitBurst    int
	WebhookRateLimitRPS   int
	WebhookRateLimitBurst int
	// AI settings for AI-assisted workflow generation and editing. Provider
	// selects the backend ("openai", the default, or "cohere"); each backend has
	// its own credentials so both may be present and switching is a single config
	// change. All optional: when the selected provider has no API key the feature
	// is reported as unavailable.
	AIProvider    string
	OpenAIAPIKey  string
	OpenAIBaseURL string
	OpenAIModel   string
	CohereAPIKey  string
	CohereBaseURL string
	CohereModel   string
	// Trial AI limits bound AI usage for disposable public-trial accounts. They
	// are enforced server-side; registered users are never limited.
	TrialAIGenerationLimit int
	TrialAIEditLimit       int
	TrialAITotalLimit      int
}

func Load() (Config, error) {
	databaseURL, err := requiredEnv("DATABASE_URL")
	if err != nil {
		return Config{}, err
	}
	httpAddr, err := requiredEnv("HTTP_ADDR")
	if err != nil {
		return Config{}, err
	}
	if err := validateDatabaseURL(databaseURL); err != nil {
		return Config{}, err
	}
	if _, _, err := net.SplitHostPort(httpAddr); err != nil {
		return Config{}, fmt.Errorf("HTTP_ADDR must be a host:port address: %q", httpAddr)
	}
	tokenSecret, err := requiredEnv("TOKEN_SECRET")
	if err != nil {
		return Config{}, err
	}
	if len(tokenSecret) < 32 {
		return Config{}, fmt.Errorf("TOKEN_SECRET must be at least 32 characters")
	}

	timeout := 5 * time.Second
	if raw := os.Getenv("DB_CONNECT_TIMEOUT"); raw != "" {
		timeout, err = time.ParseDuration(raw)
		if err != nil || timeout <= 0 {
			return Config{}, fmt.Errorf("DB_CONNECT_TIMEOUT must be a positive duration: %q", raw)
		}
	}

	maxBodyBytes := int64(1 << 20)
	if raw := os.Getenv("MAX_BODY_BYTES"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			return Config{}, fmt.Errorf("MAX_BODY_BYTES must be a positive integer: %q", raw)
		}
		maxBodyBytes = parsed
	}

	authRPS := 10
	if raw := os.Getenv("AUTH_RATE_LIMIT_RPS"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 0 {
			return Config{}, fmt.Errorf("AUTH_RATE_LIMIT_RPS must be a non-negative integer: %q", raw)
		}
		authRPS = parsed
	}
	authBurst := 20
	if raw := os.Getenv("AUTH_RATE_LIMIT_BURST"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			return Config{}, fmt.Errorf("AUTH_RATE_LIMIT_BURST must be a positive integer: %q", raw)
		}
		authBurst = parsed
	}

	webhookRPS := 20
	if raw := os.Getenv("WEBHOOK_RATE_LIMIT_RPS"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 0 {
			return Config{}, fmt.Errorf("WEBHOOK_RATE_LIMIT_RPS must be a non-negative integer: %q", raw)
		}
		webhookRPS = parsed
	}
	webhookBurst := 40
	if raw := os.Getenv("WEBHOOK_RATE_LIMIT_BURST"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			return Config{}, fmt.Errorf("WEBHOOK_RATE_LIMIT_BURST must be a positive integer: %q", raw)
		}
		webhookBurst = parsed
	}

	trialGenerationLimit, err := nonNegativeIntEnv("TRIAL_AI_GENERATION_LIMIT", 5)
	if err != nil {
		return Config{}, err
	}
	trialEditLimit, err := nonNegativeIntEnv("TRIAL_AI_EDIT_LIMIT", 5)
	if err != nil {
		return Config{}, err
	}
	trialTotalLimit, err := nonNegativeIntEnv("TRIAL_AI_TOTAL_LIMIT", 10)
	if err != nil {
		return Config{}, err
	}

	return Config{
		DatabaseURL:            databaseURL,
		HTTPAddr:               httpAddr,
		DBConnectTimeout:       timeout,
		TokenSecret:            tokenSecret,
		MaxBodyBytes:           maxBodyBytes,
		AuthRateLimitRPS:       authRPS,
		AuthRateLimitBurst:     authBurst,
		WebhookRateLimitRPS:    webhookRPS,
		WebhookRateLimitBurst:  webhookBurst,
		AIProvider:             strings.TrimSpace(os.Getenv("FLOWFORGE_AI_PROVIDER")),
		OpenAIAPIKey:           strings.TrimSpace(os.Getenv("FLOWFORGE_OPENAI_API_KEY")),
		OpenAIBaseURL:          strings.TrimSpace(os.Getenv("FLOWFORGE_OPENAI_BASE_URL")),
		OpenAIModel:            strings.TrimSpace(os.Getenv("FLOWFORGE_OPENAI_MODEL")),
		CohereAPIKey:           strings.TrimSpace(os.Getenv("FLOWFORGE_COHERE_API_KEY")),
		CohereBaseURL:          strings.TrimSpace(os.Getenv("FLOWFORGE_COHERE_BASE_URL")),
		CohereModel:            strings.TrimSpace(os.Getenv("FLOWFORGE_COHERE_MODEL")),
		TrialAIGenerationLimit: trialGenerationLimit,
		TrialAIEditLimit:       trialEditLimit,
		TrialAITotalLimit:      trialTotalLimit,
	}, nil
}

// nonNegativeIntEnv reads an optional integer environment variable, falling
// back to the supplied default. Zero disables the corresponding trial limit.
func nonNegativeIntEnv(name string, fallback int) (int, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < 0 {
		return 0, fmt.Errorf("%s must be a non-negative integer: %q", name, raw)
	}
	return parsed, nil
}

func validateDatabaseURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Host == "" {
		return fmt.Errorf("DATABASE_URL must be a valid PostgreSQL URL")
	}
	return nil
}

func requiredEnv(name string) (string, error) {
	value := os.Getenv(name)
	if value == "" {
		return "", fmt.Errorf("required environment variable %s is not set", name)
	}
	return value, nil
}
