package credential

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Credential is a project-scoped reference to secret material. The secret
// value is never stored here; it lives in a secret provider or protected
// configuration. Credential references are what appear in workflow JSON,
// never the secret itself.
type Credential struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SecretProvider resolves secret material for a credential reference by name.
// Implementations must never return the secret through a channel that is
// logged, stored in workflow JSON, or returned in a normal API response.
type SecretProvider interface {
	Resolve(ctx context.Context, name string) (string, error)
}

// EnvSecretProvider reads secrets from the environment using the convention
// FLOWFORGE_SECRET_<NAME>, where NAME is uppercased with separators replaced
// by underscores. This is the protected-configuration path for local/dev.
type EnvSecretProvider struct{}

func (EnvSecretProvider) Resolve(ctx context.Context, name string) (string, error) {
	key := "FLOWFORGE_SECRET_" + secretPath(name)
	value := os.Getenv(key)
	if value == "" {
		return "", fmt.Errorf("credential %q has no configured secret (%s)", name, key)
	}
	return value, nil
}

// StaticSecretProvider is an in-memory provider for tests.
type StaticSecretProvider map[string]string

func (p StaticSecretProvider) Resolve(ctx context.Context, name string) (string, error) {
	if value, ok := p[name]; ok {
		return value, nil
	}
	return "", fmt.Errorf("credential %q has no configured secret", name)
}

// Redact replaces occurrences of any of the provided secret values with a
// fixed placeholder so secrets never leak into logs, errors, or outputs.
func Redact(value string, secrets ...string) string {
	for _, secret := range secrets {
		if secret == "" {
			continue
		}
		value = strings.ReplaceAll(value, secret, "***")
	}
	return value
}

// RedactHeaders returns a copy of headers with sensitive keys removed.
func RedactHeaders(headers map[string]string) map[string]string {
	result := make(map[string]string, len(headers))
	for key, value := range headers {
		if isSensitiveHeader(key) {
			continue
		}
		result[strings.ToLower(key)] = value
	}
	return result
}

func isSensitiveHeader(key string) bool {
	switch strings.ToLower(key) {
	case "authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key":
		return true
	default:
		return false
	}
}

func secretPath(name string) string {
	replacer := strings.NewReplacer("-", "_", ".", "_", " ", "_", "/", "_")
	return strings.ToUpper(replacer.Replace(name))
}
