package config

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/neyati/flowforge/internal/oauth"
)

// Environment variable names for social sign-in. Every provider is configured
// through its own prefix so local development and a deployment can be set up
// independently, and so adding a provider never reshapes an existing one's
// settings.
const (
	envPublicBaseURL           = "PUBLIC_BASE_URL"
	envOAuthFrontendRedirect   = "OAUTH_FRONTEND_REDIRECT_URL"
	oauthClientIDVarSuffix     = "_CLIENT_ID"
	oauthClientSecretVarSuffix = "_CLIENT_SECRET"
	oauthTenantIDVarSuffix     = "_TENANT_ID"
	oauthRedirectVarSuffix     = "_REDIRECT_URL"
)

// defaultPublicBaseURL is the browser-facing origin assumed when PUBLIC_BASE_URL
// is unset: the Vite dev server, which proxies /api to the API on :8080. It
// makes local development work with only the provider credentials set. A
// deployment must set PUBLIC_BASE_URL (or each provider's explicit redirect
// URL), because the default origin is not reachable by a provider there.
const defaultPublicBaseURL = "http://localhost:5173"

// oauthProviderEnv describes one provider's environment surface. build receives
// the tenant only if the provider uses one.
type oauthProviderEnv struct {
	prefix string
	// id is the provider slug and the path segment of the callback URL.
	id    string
	build func(clientID, clientSecret, tenantID, redirectURL string) oauth.ProviderConfig
}

var oauthProviderEnvs = []oauthProviderEnv{
	{
		prefix: "OAUTH_GOOGLE",
		id:     oauth.ProviderGoogle,
		build: func(clientID, clientSecret, _ string, redirectURL string) oauth.ProviderConfig {
			return oauth.GoogleProvider(clientID, clientSecret, redirectURL)
		},
	},
	{
		prefix: "OAUTH_MICROSOFT",
		id:     oauth.ProviderMicrosoft,
		build: func(clientID, clientSecret, tenantID, redirectURL string) oauth.ProviderConfig {
			return oauth.MicrosoftProvider(clientID, clientSecret, tenantID, redirectURL)
		},
	},
}

// loadOAuth resolves the social sign-in configuration: the enabled providers and
// the frontend URL the callback hands control back to.
//
// A provider with no credentials is simply absent. A provider with credentials
// but incomplete or invalid settings is an error, so a half-configured provider
// fails at startup instead of silently disappearing from the sign-in page.
func loadOAuth() ([]oauth.ProviderConfig, string, error) {
	base, err := publicBaseURL()
	if err != nil {
		return nil, "", err
	}
	providers, err := loadOAuthProviders(base)
	if err != nil {
		return nil, "", err
	}

	frontendRedirect := strings.TrimSpace(os.Getenv(envOAuthFrontendRedirect))
	if frontendRedirect == "" {
		frontendRedirect = base + "/auth/callback"
	} else if err := validateAbsoluteURL(envOAuthFrontendRedirect, frontendRedirect); err != nil {
		return nil, "", err
	}
	return providers, frontendRedirect, nil
}

// publicBaseURL returns the browser-facing origin of this API, normalised
// without a trailing slash so callback paths can be appended directly.
func publicBaseURL() (string, error) {
	raw := strings.TrimSpace(os.Getenv(envPublicBaseURL))
	if raw == "" {
		raw = defaultPublicBaseURL
	}
	raw = strings.TrimRight(raw, "/")
	if err := validateAbsoluteURL(envPublicBaseURL, raw); err != nil {
		return "", err
	}
	return raw, nil
}

func loadOAuthProviders(base string) ([]oauth.ProviderConfig, error) {
	providers := make([]oauth.ProviderConfig, 0, len(oauthProviderEnvs))
	for _, entry := range oauthProviderEnvs {
		clientID := envValue(entry.prefix + oauthClientIDVarSuffix)
		clientSecret := envValue(entry.prefix + oauthClientSecretVarSuffix)
		// A client ID with no secret (or the reverse) is a mistake, not a
		// disabled provider: it would leave the button hidden while the operator
		// believes sign-in is configured.
		if (clientID == "") != (clientSecret == "") {
			return nil, fmt.Errorf(
				"%s%s and %s%s must be set together",
				entry.prefix, oauthClientIDVarSuffix, entry.prefix, oauthClientSecretVarSuffix,
			)
		}
		if clientID == "" {
			continue
		}

		redirectURL := envValue(entry.prefix + oauthRedirectVarSuffix)
		if redirectURL == "" {
			redirectURL = base + oauthCallbackPath(entry.id)
		} else if err := validateAbsoluteURL(entry.prefix+oauthRedirectVarSuffix, redirectURL); err != nil {
			return nil, err
		}
		providers = append(providers, entry.build(
			clientID,
			clientSecret,
			envValue(entry.prefix+oauthTenantIDVarSuffix),
			redirectURL,
		))
	}
	if len(providers) == 0 {
		return nil, nil
	}
	return providers, nil
}

// oauthCallbackPath is the API route the provider redirects back to. It must
// match the redirect URI registered with the provider.
func oauthCallbackPath(providerID string) string {
	return "/api/v1/auth/oauth/" + providerID + "/callback"
}

func envValue(name string) string { return strings.TrimSpace(os.Getenv(name)) }

// oauthStateSecret derives the key that seals OAuth flow state from the
// deployment's TOKEN_SECRET. The state cookie and the access token share the
// same base64url-payload.HMAC envelope, so signing both with one key would let a
// blob minted for one purpose be presented for the other. Hashing the secret
// under a distinct label gives each its own key without adding a second secret
// an operator has to generate and keep in step with the first.
func oauthStateSecret(tokenSecret string) string {
	sum := sha256.Sum256([]byte("flowforge/oauth-state/v1\x00" + tokenSecret))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// validateAbsoluteURL rejects anything a browser could not be redirected to as a
// plain absolute http(s) URL, which is what both the callback and the frontend
// hand-off require. A relative or non-web URL here would produce a redirect the
// browser cannot follow, so it is refused at startup.
func validateAbsoluteURL(name, raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("%s must be a valid URL: %q", name, raw)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("%s must be an absolute http(s) URL: %q", name, raw)
	}
	if parsed.Host == "" {
		return fmt.Errorf("%s must include a host: %q", name, raw)
	}
	if parsed.Fragment != "" {
		return fmt.Errorf("%s must not contain a fragment: %q", name, raw)
	}
	return nil
}
