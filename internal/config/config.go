package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"time"
)

type Config struct {
	DatabaseURL      string
	HTTPAddr         string
	DBConnectTimeout time.Duration
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

	timeout := 5 * time.Second
	if raw := os.Getenv("DB_CONNECT_TIMEOUT"); raw != "" {
		timeout, err = time.ParseDuration(raw)
		if err != nil || timeout <= 0 {
			return Config{}, fmt.Errorf("DB_CONNECT_TIMEOUT must be a positive duration: %q", raw)
		}
	}

	return Config{DatabaseURL: databaseURL, HTTPAddr: httpAddr, DBConnectTimeout: timeout}, nil
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
