package oauth

import (
	"net/url"
	"strings"
)

// Provider identifiers. They are part of the public API surface (they appear in
// the challenge URL and in the client's provider list), so the values are
// stable, lower-case slugs.
const (
	ProviderGoogle    = "google"
	ProviderMicrosoft = "microsoft"
)

// Scope names requested from the providers. They are declared once and composed
// per provider, so a scope cannot be spelled into one request and misspelled out
// of another, and the exact set a provider asks for is readable in one place
// instead of being assembled at a call site.
const (
	// ScopeOpenID is required by both providers: it marks the request as OpenID
	// Connect and is what makes the userinfo endpoint callable.
	ScopeOpenID = "openid"
	// ScopeEmail returns the account's address claim. Google needs it, because
	// FlowForge keys every account by its address and Google's userinfo response
	// carries that address only when this scope is requested. Microsoft is
	// deliberately not asked for it: there it is a fourth permission on the
	// consent prompt, and the same address is available from Microsoft Graph
	// under User.Read, which this application already needs and asks for.
	ScopeEmail = "email"
	// ScopeProfile returns the name claims (name, given_name, family_name) that
	// become the account's display name.
	ScopeProfile = "profile"
	// ScopeUserRead is the only Microsoft Graph delegated permission this
	// application asks for, and the only one it needs. Microsoft's userinfo
	// endpoint is a Microsoft Graph API, so this permission is what authorizes
	// reading the signed-in user's own profile. No other Graph permission
	// (mail, calendar, files, groups, directory) is requested anywhere.
	ScopeUserRead = "User.Read"
)

// Default endpoints for the supported providers. Both are OpenID Connect
// authorization-code providers, so the flow is identical for each; only the
// URLs and the shape of the profile response differ.
const (
	googleAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserInfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

	microsoftAuthBaseURL = "https://login.microsoftonline.com"
	// Microsoft's userinfo endpoint is a Microsoft Graph API rather than part of
	// the login host: it is the openid scope plus the Microsoft Graph access
	// token the authorization request returns that make it callable.
	microsoftUserInfoURL = "https://graph.microsoft.com/oidc/userinfo"
	// microsoftProfileURL is the Microsoft Graph user resource for the signed-in
	// account. It is where the account's address comes from: Microsoft's userinfo
	// response carries the `email` claim only when the `email` scope was
	// requested, and this application does not request it. Reading /me needs the
	// User.Read permission the application already asks for, and returns mail,
	// userPrincipalName, displayName and the name parts for a work/school and a
	// personal Microsoft account alike.
	microsoftProfileURL = "https://graph.microsoft.com/v1.0/me"
	// defaultMicrosoftTenantID is used when the deployment is not pinned to one
	// tenant; "common" accepts both work/school and personal accounts.
	defaultMicrosoftTenantID = "common"
)

// ProviderConfig is one configured OAuth provider. A provider only exists in a
// Service when it is fully configured, so the presence of a ProviderConfig is
// itself the "this provider is available" signal.
type ProviderConfig struct {
	ID           string
	Name         string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	AuthURL      string
	TokenURL     string
	UserInfoURL  string
	// ProfileURL is a second resource endpoint, read with the same access token
	// as UserInfoURL, and only when the userinfo response carried no usable
	// address. It exists for a provider whose userinfo response cannot carry an
	// address under the requested scopes (see microsoftProfileURL). Empty for a
	// provider that needs no such read.
	ProfileURL string
	Scopes     []string
	// ExtraAuthParams are added to the authorization request. Microsoft, for
	// example, needs an explicit response_mode.
	ExtraAuthParams map[string]string
}

// GoogleProvider builds the Google configuration. redirectURL must be the
// callback on this API, and must match the URI registered in the Google Cloud
// console exactly (scheme, host, path).
func GoogleProvider(clientID, clientSecret, redirectURL string) ProviderConfig {
	return ProviderConfig{
		ID:           ProviderGoogle,
		Name:         "Google",
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		AuthURL:      googleAuthURL,
		TokenURL:     googleTokenURL,
		UserInfoURL:  googleUserInfoURL,
		// Google is asked for the account's address and name claims through the
		// plain OpenID Connect scopes: nothing beyond identifying this account,
		// and nothing beyond sign-in.
		Scopes: []string{ScopeOpenID, ScopeEmail, ScopeProfile},
		// select_account always shows the account chooser instead of silently
		// reusing the browser's single signed-in account, so a user can pick a
		// different identity than the one they last used.
		ExtraAuthParams: map[string]string{"prompt": "select_account"},
	}
}

// MicrosoftProvider builds the Microsoft identity platform configuration.
// tenantID scopes the provider ("common", "organizations", "consumers", or a
// directory GUID); an empty value means "common".
func MicrosoftProvider(clientID, clientSecret, tenantID, redirectURL string) ProviderConfig {
	if strings.TrimSpace(tenantID) == "" {
		tenantID = defaultMicrosoftTenantID
	}
	// The tenant is interpolated into a URL path, so it is escaped rather than
	// trusted: a malformed value then produces an unmatched endpoint instead of
	// redirecting somewhere unintended.
	tenant := url.PathEscape(strings.TrimSpace(tenantID))
	return ProviderConfig{
		ID:           ProviderMicrosoft,
		Name:         "Microsoft",
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		AuthURL:      microsoftAuthBaseURL + "/" + tenant + "/oauth2/v2.0/authorize",
		TokenURL:     microsoftAuthBaseURL + "/" + tenant + "/oauth2/v2.0/token",
		UserInfoURL:  microsoftUserInfoURL,
		ProfileURL:   microsoftProfileURL,
		// Exactly three permissions: the two OpenID Connect scopes that identify
		// the account, plus the single Microsoft Graph delegated permission that
		// authorizes reading that account's own profile. `email` is not among
		// them — it would be a fourth permission on the consent prompt for
		// information the same User.Read token already returns from Graph. No
		// other Graph permission is requested — not mail, calendar, files, groups
		// or directory — and none is needed.
		Scopes: []string{ScopeOpenID, ScopeProfile, ScopeUserRead},
		ExtraAuthParams: map[string]string{
			// query keeps the authorization response in the query string, which
			// is what the callback handler reads.
			"response_mode": "query",
		},
	}
}
