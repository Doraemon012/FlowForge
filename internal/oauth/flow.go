package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

var (
	// ErrExchangeFailed means the provider rejected the authorization code (or
	// the request to it failed). The provider's own error code is carried in a
	// ProviderError for logging; it is never surfaced to the browser verbatim.
	ErrExchangeFailed = errors.New("oauth code exchange failed")
	// ErrProfileUnavailable means the userinfo call failed, so no trustworthy
	// identity could be established.
	ErrProfileUnavailable = errors.New("oauth profile request failed")
	// ErrProfileIncomplete means the profile carried no stable subject, so the
	// identity could not be keyed and must not be used.
	ErrProfileIncomplete = errors.New("oauth profile is missing a subject")
	// ErrEmailMissing means the provider returned no usable email address. The
	// product requires an email for every account, so this is a hard failure
	// rather than a partially-created user.
	ErrEmailMissing = errors.New("oauth profile has no email address")
)

// maxProviderResponseBytes caps how much of a provider response is read. Token
// and userinfo payloads are small; anything larger is a misconfiguration or a
// hostile endpoint, and must not be buffered without limit.
const maxProviderResponseBytes = 1 << 20

// Profile is the provider-derived identity of the person signing in. It is the
// only thing the rest of the system learns from a provider.
type Profile struct {
	// Subject is the provider's stable, never-reassigned user identifier, and
	// the key an account is linked by. It is not the email: emails change hands.
	Subject string
	// Email is the address the provider asserts for this account.
	Email string
	// EmailVerified reports whether the provider itself vouches that the
	// account controls this address. It decides whether an existing
	// password-protected account may be linked automatically.
	EmailVerified bool
	// DisplayName is the name the provider shows for the account. It may be
	// empty, in which case the caller derives one.
	DisplayName string
}

// ProviderError describes a failure reported by the provider itself, keeping
// the provider's error code available for logs without exposing it to a caller.
type ProviderError struct {
	Endpoint    string
	StatusCode  int
	Code        string
	Description string
}

func (e *ProviderError) Error() string {
	switch {
	case e.Code != "" && e.Description != "":
		return fmt.Sprintf("%s: %s: %s (%s)", e.Endpoint, e.Code, e.Description, e.statusText())
	case e.Code != "":
		return fmt.Sprintf("%s: %s (%s)", e.Endpoint, e.Code, e.statusText())
	default:
		return fmt.Sprintf("%s: unexpected status %s", e.Endpoint, e.statusText())
	}
}

func (e *ProviderError) statusText() string {
	if e.StatusCode == 0 {
		return "no response"
	}
	return http.StatusText(e.StatusCode)
}

// Exchange completes the authorization-code flow and returns the provider
// profile: it swaps the code for an access token, then reads the account
// identity from the provider's userinfo endpoint.
//
// The ID token returned alongside the access token is deliberately not parsed or
// trusted. Reading the identity from userinfo over a direct TLS connection
// avoids implementing JWT signature and key-rotation checks on the sign-in path,
// where a mistake would be an authentication bypass.
func (s *Service) Exchange(ctx context.Context, providerID, code, codeVerifier string) (Profile, error) {
	if s == nil {
		return Profile{}, ErrProviderNotConfigured
	}
	provider, ok := s.providers[providerID]
	if !ok {
		return Profile{}, ErrProviderNotConfigured
	}
	if strings.TrimSpace(code) == "" {
		return Profile{}, fmt.Errorf("%w: empty authorization code", ErrExchangeFailed)
	}

	accessToken, err := s.exchangeCode(ctx, provider, code, codeVerifier)
	if err != nil {
		return Profile{}, err
	}
	claims, err := s.fetchUserInfo(ctx, provider, accessToken)
	if err != nil {
		return Profile{}, err
	}
	claims, err = s.completeProfile(ctx, provider, accessToken, claims)
	if err != nil {
		return Profile{}, err
	}
	return profileFrom(provider.ID, claims)
}

// graphProfile is the subset of the Microsoft Graph user resource that the
// sign-in path reads. Graph names its properties in camelCase, unlike the
// snake_case OpenID Connect claims, so it is decoded from the profile response
// separately from userInfoClaims.
type graphProfile struct {
	Mail              string `json:"mail"`
	UserPrincipalName string `json:"userPrincipalName"`
	DisplayName       string `json:"displayName"`
	GivenName         string `json:"givenName"`
	Surname           string `json:"surname"`
}

// completeProfile fills the identity the userinfo response could not carry, by
// reading the provider's profile endpoint. It is a no-op for a provider that has
// none, and for one whose userinfo response already carried an address, so the
// extra request happens only where it is the only way to obtain one.
func (s *Service) completeProfile(ctx context.Context, provider ProviderConfig, accessToken string, claims userInfoClaims) (userInfoClaims, error) {
	if provider.ProfileURL == "" || pickEmail(claims) != "" {
		return claims, nil
	}
	profile, err := s.fetchProfile(ctx, provider, accessToken)
	if err != nil {
		return userInfoClaims{}, err
	}
	return claims.withProfile(profile), nil
}

// fetchProfile reads the provider's profile endpoint with the access token from
// the same exchange. That endpoint is a resource API authorized by a permission
// outside the OpenID Connect scopes (at Microsoft, User.Read authorizing a
// Microsoft Graph call), which is why it is read separately from userinfo.
func (s *Service) fetchProfile(ctx context.Context, provider ProviderConfig, accessToken string) (graphProfile, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.ProfileURL, nil)
	if err != nil {
		return graphProfile{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return graphProfile{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponseBytes))
	if err != nil {
		return graphProfile{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	if response.StatusCode != http.StatusOK {
		return graphProfile{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, &ProviderError{
			Endpoint:   "profile",
			StatusCode: response.StatusCode,
		})
	}
	var profile graphProfile
	if err := json.Unmarshal(body, &profile); err != nil {
		return graphProfile{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	return profile, nil
}

// withProfile fills the gaps in a userinfo response from a resource profile. It
// only fills: a claim the userinfo response carried is never replaced, so that
// response stays authoritative for everything it provides.
func (claims userInfoClaims) withProfile(profile graphProfile) userInfoClaims {
	if claims.Mail == "" {
		claims.Mail = profile.Mail
	}
	if claims.PreferredUsername == "" {
		claims.PreferredUsername = directoryUsername(profile.UserPrincipalName)
	}
	if claims.Name == "" {
		claims.Name = profile.DisplayName
	}
	if claims.GivenName == "" {
		claims.GivenName = profile.GivenName
	}
	if claims.FamilyName == "" {
		claims.FamilyName = profile.Surname
	}
	return claims
}

// directoryUsername turns a directory user principal name into a bare address.
// Microsoft Graph represents a personal Microsoft account by joining the
// sign-in name its mailbox uses to the account's namespace with a '#', as in
// "live.com#someone@outlook.com", where the address is the part after the last
// '#'. A value that does not yield a complete address is returned unchanged, so
// a work/school user principal name is left exactly as the directory holds it:
// Microsoft's guest form "AdeleVance_adatum.com#EXT#@contoso.com" has no local
// part after its last '#' and is therefore not mistaken for one.
func directoryUsername(userPrincipalName string) string {
	trimmed := strings.TrimSpace(userPrincipalName)
	separator := strings.LastIndex(trimmed, "#")
	if separator < 0 {
		return trimmed
	}
	candidate := plausibleAddress(trimmed[separator+1:])
	if candidate == "" || strings.HasPrefix(candidate, "@") {
		return trimmed
	}
	return candidate
}

// tokenResponse covers both the success and error shapes of a token endpoint.
// Providers answer a rejected code with 400 and an `error` field, so both are
// decoded from the same body.
type tokenResponse struct {
	AccessToken      string `json:"access_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int64  `json:"expires_in"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

func (s *Service) exchangeCode(ctx context.Context, provider ProviderConfig, code, codeVerifier string) (string, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {provider.RedirectURL},
		"client_id":     {provider.ClientID},
		"client_secret": {provider.ClientSecret},
		"code_verifier": {codeVerifier},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExchangeFailed, err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExchangeFailed, err)
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponseBytes))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExchangeFailed, err)
	}
	var decoded tokenResponse
	if err := json.Unmarshal(body, &decoded); err != nil {
		return "", fmt.Errorf("%w: %v", ErrExchangeFailed, &ProviderError{Endpoint: "token", StatusCode: response.StatusCode})
	}
	if response.StatusCode != http.StatusOK || decoded.Error != "" {
		return "", fmt.Errorf("%w: %v", ErrExchangeFailed, &ProviderError{
			Endpoint:    "token",
			StatusCode:  response.StatusCode,
			Code:        decoded.Error,
			Description: decoded.ErrorDescription,
		})
	}
	if decoded.AccessToken == "" {
		return "", fmt.Errorf("%w: %v", ErrExchangeFailed, &ProviderError{Endpoint: "token", StatusCode: response.StatusCode})
	}
	return decoded.AccessToken, nil
}

// userInfoClaims is the union of the claims the supported providers return from
// their userinfo endpoints. Fields a provider does not send stay zero.
type userInfoClaims struct {
	Subject           string `json:"sub"`
	Email             string `json:"email"`
	EmailVerified     *bool  `json:"email_verified"`
	Name              string `json:"name"`
	GivenName         string `json:"given_name"`
	FamilyName        string `json:"family_name"`
	PreferredUsername string `json:"preferred_username"`
	Mail              string `json:"mail"`
}

func (s *Service) fetchUserInfo(ctx context.Context, provider ProviderConfig, accessToken string) (userInfoClaims, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.UserInfoURL, nil)
	if err != nil {
		return userInfoClaims{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return userInfoClaims{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponseBytes))
	if err != nil {
		return userInfoClaims{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	if response.StatusCode != http.StatusOK {
		return userInfoClaims{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, &ProviderError{
			Endpoint:   "userinfo",
			StatusCode: response.StatusCode,
		})
	}
	var claims userInfoClaims
	if err := json.Unmarshal(body, &claims); err != nil {
		return userInfoClaims{}, fmt.Errorf("%w: %v", ErrProfileUnavailable, err)
	}
	return claims, nil
}

// profileFrom reduces provider claims to the identity the rest of the system
// uses, rejecting anything that cannot key or name an account.
func profileFrom(providerID string, claims userInfoClaims) (Profile, error) {
	subject := strings.TrimSpace(claims.Subject)
	if subject == "" {
		return Profile{}, fmt.Errorf("%w: provider %s", ErrProfileIncomplete, providerID)
	}
	email := pickEmail(claims)
	if email == "" {
		return Profile{}, fmt.Errorf("%w: provider %s", ErrEmailMissing, providerID)
	}
	return Profile{
		Subject: subject,
		Email:   email,
		// A missing claim is treated as unverified. Only an explicit true allows
		// an existing password-protected account to be linked by email.
		EmailVerified: claims.EmailVerified != nil && *claims.EmailVerified,
		DisplayName:   displayNameFrom(claims),
	}, nil
}

// pickEmail returns the first plausible address from the claims. Google sets
// `email`. Microsoft's userinfo response cannot carry an address under the
// scopes this application requests, so for Microsoft the address arrives from
// its profile endpoint instead: `mail` (an SMTP address) or the user principal
// name, which is what a personal account is represented by.
func pickEmail(claims userInfoClaims) string {
	for _, candidate := range []string{claims.Email, claims.Mail, claims.PreferredUsername} {
		if address := plausibleAddress(candidate); address != "" {
			return address
		}
	}
	return ""
}

// plausibleAddress filters out values that are not a bare address. The email is
// used as an account key, so anything containing a display name, whitespace, or
// no '@' is rejected rather than stored.
func plausibleAddress(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || len(trimmed) > 320 || !strings.Contains(trimmed, "@") {
		return ""
	}
	if strings.ContainsAny(trimmed, " \t\r\n<>") {
		return ""
	}
	return trimmed
}

func displayNameFrom(claims userInfoClaims) string {
	if name := strings.TrimSpace(claims.Name); name != "" {
		return name
	}
	return strings.TrimSpace(strings.TrimSpace(claims.GivenName) + " " + strings.TrimSpace(claims.FamilyName))
}
