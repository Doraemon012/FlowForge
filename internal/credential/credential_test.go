package credential

import (
	"context"
	"testing"
)

func TestStaticSecretProvider(t *testing.T) {
	provider := StaticSecretProvider{"api": "s3cret"}
	value, err := provider.Resolve(context.Background(), "api")
	if err != nil || value != "s3cret" {
		t.Fatalf("resolve = %q, %v", value, err)
	}
	if _, err := provider.Resolve(context.Background(), "missing"); err == nil {
		t.Fatal("missing credential should error")
	}
}

func TestRedact(t *testing.T) {
	got := Redact("Authorization: Bearer abc123 and url https://abc123@example.com", "abc123")
	if got != "Authorization: Bearer *** and url https://***@example.com" {
		t.Fatalf("redact = %q", got)
	}
}

func TestRedactHeaders(t *testing.T) {
	headers := map[string]string{
		"Authorization": "Bearer secret",
		"X-API-Key":     "key",
		"Content-Type":  "application/json",
	}
	got := RedactHeaders(headers)
	if _, ok := got["authorization"]; ok {
		t.Fatal("authorization header not redacted")
	}
	if _, ok := got["x-api-key"]; ok {
		t.Fatal("x-api-key header not redacted")
	}
	if got["content-type"] != "application/json" {
		t.Fatalf("content-type lost: %v", got)
	}
}
