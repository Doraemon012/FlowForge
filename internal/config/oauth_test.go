package config

import (
	"strings"
	"testing"

	"github.com/neyati/flowforge/internal/oauth"
)

// clearOAuthEnv blanks every social sign-in variable so a test observes only
// what it sets itself. t.Setenv restores the previous values when it ends.
func clearOAuthEnv(t *testing.T) {
	t.Helper()
	for _, name := range []string{
		envPublicBaseURL,
		envOAuthFrontendRedirect,
		"OAUTH_GOOGLE_CLIENT_ID",
		"OAUTH_GOOGLE_CLIENT_SECRET",
		"OAUTH_GOOGLE_TENANT_ID",
		"OAUTH_GOOGLE_REDIRECT_URL",
		"OAUTH_MICROSOFT_CLIENT_ID",
		"OAUTH_MICROSOFT_CLIENT_SECRET",
		"OAUTH_MICROSOFT_TENANT_ID",
		"OAUTH_MICROSOFT_REDIRECT_URL",
	} {
		t.Setenv(name, "")
	}
}

func TestLoadOAuthWithoutCredentialsAdvertisesNothing(t *testing.T) {
	clearOAuthEnv(t)

	providers, frontendRedirect, err := loadOAuth()
	if err != nil {
		t.Fatalf("loadOAuth() returned an unexpected error: %v", err)
	}
	if len(providers) != 0 {
		t.Fatalf("expected no providers, got %d", len(providers))
	}
	if want := defaultPublicBaseURL + "/auth/callback"; frontendRedirect != want {
		t.Errorf("frontend redirect = %q, want %q", frontendRedirect, want)
	}
}

// A client ID with no secret is a mistake rather than a disabled provider:
// hiding the button while the operator believes sign-in is configured is the
// failure mode this rejects at startup.
func TestLoadOAuthRejectsHalfConfiguredProvider(t *testing.T) {
	clearOAuthEnv(t)
	t.Setenv("OAUTH_GOOGLE_CLIENT_ID", "client-id-without-a-secret")

	if _, _, err := loadOAuth(); err == nil {
		t.Fatal("expected an error for a client ID set without its secret")
	}
}

func TestLoadOAuthRejectsRelativePublicBaseURL(t *testing.T) {
	clearOAuthEnv(t)
	t.Setenv(envPublicBaseURL, "/not-absolute")

	if _, _, err := loadOAuth(); err == nil {
		t.Fatal("expected an error for a relative PUBLIC_BASE_URL")
	}
}

func TestLoadOAuthBuildsBothConfiguredProviders(t *testing.T) {
	clearOAuthEnv(t)
	t.Setenv(envPublicBaseURL, "https://api.example.com/")
	t.Setenv("OAUTH_GOOGLE_CLIENT_ID", "google-id")
	t.Setenv("OAUTH_GOOGLE_CLIENT_SECRET", "google-secret")
	t.Setenv("OAUTH_MICROSOFT_CLIENT_ID", "microsoft-id")
	t.Setenv("OAUTH_MICROSOFT_CLIENT_SECRET", "microsoft-secret")
	t.Setenv("OAUTH_MICROSOFT_TENANT_ID", "organizations")

	providers, frontendRedirect, err := loadOAuth()
	if err != nil {
		t.Fatalf("loadOAuth() returned an unexpected error: %v", err)
	}
	if len(providers) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(providers))
	}

	byID := make(map[string]oauth.ProviderConfig, len(providers))
	for _, provider := range providers {
		byID[provider.ID] = provider
	}

	google, ok := byID[oauth.ProviderGoogle]
	if !ok {
		t.Fatal("the configured Google provider is missing")
	}
	// The trailing slash on PUBLIC_BASE_URL must not double up in the callback.
	if want := "https://api.example.com/api/v1/auth/oauth/google/callback"; google.RedirectURL != want {
		t.Errorf("google redirect = %q, want %q", google.RedirectURL, want)
	}

	microsoft, ok := byID[oauth.ProviderMicrosoft]
	if !ok {
		t.Fatal("the configured Microsoft provider is missing")
	}
	if want := "https://api.example.com/api/v1/auth/oauth/microsoft/callback"; microsoft.RedirectURL != want {
		t.Errorf("microsoft redirect = %q, want %q", microsoft.RedirectURL, want)
	}
	if !strings.Contains(microsoft.TokenURL, "/organizations/oauth2/v2.0/token") {
		t.Errorf("microsoft token URL = %q, want the configured tenant", microsoft.TokenURL)
	}

	if want := "https://api.example.com/auth/callback"; frontendRedirect != want {
		t.Errorf("frontend redirect = %q, want %q", frontendRedirect, want)
	}
}

// The flow state cookie and the access token share one envelope format, so the
// state key is derived rather than reused. This pins that property.
func TestOAuthStateSecretIsDerivedFromTokenSecret(t *testing.T) {
	const tokenSecret = "01234567890123456789012345678901"

	derived := oauthStateSecret(tokenSecret)
	if derived == "" {
		t.Fatal("the derived OAuth state key must not be empty")
	}
	if derived == tokenSecret {
		t.Fatal("the OAuth state key must not reuse the access-token secret verbatim")
	}
	if again := oauthStateSecret(tokenSecret); again != derived {
		t.Errorf("derivation must be deterministic: %q != %q", again, derived)
	}
	if other := oauthStateSecret(tokenSecret + "!"); other == derived {
		t.Error("a different token secret must derive a different state key")
	}
}
