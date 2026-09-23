package httpapi

import (
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/oauth"
	"github.com/neyati/flowforge/internal/user"
)

// oauthStateCookieName carries the sealed flow state between the challenge and
// the callback. It is scoped to the OAuth routes and is HttpOnly, so no script
// can read or replace it.
const oauthStateCookieName = "flowforge_oauth_state"

// oauthStateCookiePath limits the cookie to the routes that need it, so it is
// not attached to ordinary API calls.
const oauthStateCookiePath = "/api/v1/auth/oauth"

// oauthErrorCodeKey is the fragment parameter the SPA reads to explain a failed
// sign-in. Values are stable, non-sensitive codes; the human message is chosen
// by the client so it stays consistent with the rest of the UI.
const oauthErrorCodeKey = "error"

// SetOAuth wires social sign-in. It must be called before Router() so the
// routes are mounted; a nil service (or one with no providers) leaves the
// feature absent, which is how a deployment without provider credentials
// behaves. identities stores the provider-to-account links.
func (s *Server) SetOAuth(service *oauth.Service, identities user.IdentityRepository, frontendRedirectURL string) {
	s.oauth = service
	s.identities = identities
	s.oauthFrontendRedirect = frontendRedirectURL
}

// oauthEnabled reports whether social sign-in can serve requests at all.
func (s *Server) oauthEnabled() bool {
	return s.oauth != nil && s.identities != nil && s.oauthFrontendRedirect != ""
}

// ListOAuthProviders reports which providers this deployment can authenticate
// against, so the client renders exactly the buttons that work instead of
// guessing from its own build-time configuration.
func (s *Server) ListOAuthProviders(w http.ResponseWriter, r *http.Request) {
	providers := s.oauth.Providers()
	writeJSON(w, http.StatusOK, map[string]any{"providers": providers})
}

// StartOAuth begins a provider sign-in: it seals the flow state into a cookie
// and sends the browser to the provider.
//
// The state is generated here, never accepted from the client, and the PKCE
// verifier it carries never leaves the server. That is what makes the callback
// safe to expose to the browser at all.
func (s *Server) StartOAuth(w http.ResponseWriter, r *http.Request) {
	providerID := chi.URLParam(r, "provider")
	if !s.oauthEnabled() || !s.oauth.Enabled(providerID) {
		writeError(w, http.StatusNotFound, "provider_unavailable", "this sign-in provider is not available")
		return
	}

	nonce, err := oauth.NewNonce()
	if err != nil {
		s.logOAuthFailure("generate state nonce", err, providerID)
		writeError(w, http.StatusInternalServerError, "signin_failed", "unable to start sign-in")
		return
	}
	verifier, err := oauth.NewCodeVerifier()
	if err != nil {
		s.logOAuthFailure("generate pkce verifier", err, providerID)
		writeError(w, http.StatusInternalServerError, "signin_failed", "unable to start sign-in")
		return
	}

	state := oauth.State{
		Provider: providerID,
		Nonce:    nonce,
		Verifier: verifier,
		Next:     safeNextPath(r.URL.Query().Get("next")),
		Expires:  time.Now().Add(oauth.StateLifetime).Unix(),
	}
	sealed, err := s.oauth.SealState(state)
	if err != nil {
		s.logOAuthFailure("seal state", err, providerID)
		writeError(w, http.StatusInternalServerError, "signin_failed", "unable to start sign-in")
		return
	}

	authorizationURL, err := s.oauth.AuthorizationURL(providerID, state.Nonce, oauth.CodeChallenge(verifier))
	if err != nil {
		s.logOAuthFailure("build authorization url", err, providerID)
		writeError(w, http.StatusNotFound, "provider_unavailable", "this sign-in provider is not available")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:  oauthStateCookieName,
		Value: sealed,
		Path:  oauthStateCookiePath,
		// MaxAge mirrors the state expiry: the flow must not outlive the state
		// it started with.
		MaxAge:   int(oauth.StateLifetime.Seconds()),
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		// Lax is required: the callback is a top-level cross-site navigation
		// from the provider, which Lax permits (and which Strict would block).
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, authorizationURL, http.StatusFound)
}

// OAuthCallback completes a provider sign-in and hands the browser back to the
// SPA.
//
// Every outcome — success, cancellation, a rejected code, an unusable identity —
// ends in a redirect to the frontend, because this endpoint is reached by the
// browser as a navigation and cannot render an API error meaningfully.
func (s *Server) OAuthCallback(w http.ResponseWriter, r *http.Request) {
	providerID := chi.URLParam(r, "provider")
	if !s.oauthEnabled() || !s.oauth.Enabled(providerID) {
		writeError(w, http.StatusNotFound, "provider_unavailable", "this sign-in provider is not available")
		return
	}

	state, err := s.consumeOAuthState(r, providerID)
	if err != nil {
		s.completeOAuthFailure(w, r, providerID, "", "state_invalid")
		return
	}
	// The state cookie is single-use; clear it now so a replay of this callback
	// URL cannot start again.
	clearOAuthStateCookie(w, r)

	if providerError := strings.TrimSpace(r.URL.Query().Get(oauthErrorCodeKey)); providerError != "" {
		// The provider reported the outcome. A cancellation is a normal choice,
		// not an error, and the client says so; anything else is a failure.
		s.completeOAuthFailure(w, r, providerID, state.Next, oauthFailureCode(providerError))
		return
	}

	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		s.completeOAuthFailure(w, r, providerID, state.Next, "invalid_request")
		return
	}

	profile, err := s.oauth.Exchange(r.Context(), providerID, code, state.Verifier)
	if err != nil {
		s.logOAuthFailure("exchange authorization code", err, providerID)
		s.completeOAuthFailure(w, r, providerID, state.Next, oauthExchangeFailureCode(err))
		return
	}

	account, err := s.resolveOAuthUser(r.Context(), providerID, profile)
	if err != nil {
		s.logOAuthFailure("resolve account", err, providerID)
		s.completeOAuthFailure(w, r, providerID, state.Next, oauthAccountFailureCode(err))
		return
	}

	token, err := s.tokens.Issue(account.ID, defaultTokenLifetime)
	if err != nil {
		s.logOAuthFailure("issue access token", err, providerID)
		s.completeOAuthFailure(w, r, providerID, state.Next, "signin_failed")
		return
	}
	s.completeOAuthSuccess(w, r, account.ID, state.Next, token)
}

// consumeOAuthState reads the sealed state cookie and checks it against the
// value the provider echoed back. Both halves are needed: the signature proves
// the cookie was minted here, and the nonce comparison proves this callback
// belongs to that sign-in.
func (s *Server) consumeOAuthState(r *http.Request, providerID string) (oauth.State, error) {
	cookie, err := r.Cookie(oauthStateCookieName)
	if err != nil || cookie.Value == "" {
		return oauth.State{}, oauth.ErrStateInvalid
	}
	state, err := s.oauth.OpenState(cookie.Value)
	if err != nil {
		return oauth.State{}, err
	}
	if state.Provider != providerID {
		return oauth.State{}, oauth.ErrStateInvalid
	}
	// Compared in constant time so the response cannot be used to recover the
	// nonce byte by byte.
	if subtle.ConstantTimeCompare([]byte(state.Nonce), []byte(r.URL.Query().Get("state"))) != 1 {
		return oauth.State{}, oauth.ErrStateInvalid
	}
	return state, nil
}

// completeOAuthSuccess hands the session back to the SPA in the URL fragment.
// The fragment is chosen deliberately: unlike a query string it is not sent to
// any server, is not written to server logs, and is not attached as a Referer
// when the page loads other resources.
//
// The user id travels with the token so the SPA can persist a complete session
// in the same shape the register and login endpoints return, without a second
// request on the critical path.
func (s *Server) completeOAuthSuccess(w http.ResponseWriter, r *http.Request, userID uuid.UUID, next, token string) {
	values := url.Values{}
	values.Set("access_token", token)
	values.Set("token_type", "Bearer")
	values.Set("expires_in", strconv.Itoa(int(defaultTokenLifetime.Seconds())))
	values.Set("user_id", userID.String())
	if next != "" {
		values.Set("next", next)
	}
	http.Redirect(w, r, s.oauthFrontendRedirect+"#"+values.Encode(), http.StatusFound)
}

// completeOAuthFailure sends the browser back to the SPA with a code it turns
// into a message. The provider is included so the message can name it.
func (s *Server) completeOAuthFailure(w http.ResponseWriter, r *http.Request, providerID, next, code string) {
	values := url.Values{}
	values.Set(oauthErrorCodeKey, code)
	values.Set("provider", providerID)
	if next != "" {
		values.Set("next", next)
	}
	http.Redirect(w, r, s.oauthFrontendRedirect+"#"+values.Encode(), http.StatusFound)
}

func clearOAuthStateCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookieName,
		Value:    "",
		Path:     oauthStateCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) logOAuthFailure(action string, err error, providerID string) {
	// The provider's own error text is logged, never returned: it is diagnostic
	// output for an operator.
	var providerErr *oauth.ProviderError
	attributes := []any{"action", action, "provider", providerID, "error", err}
	if errors.As(err, &providerErr) {
		attributes = append(attributes, "provider_error", providerErr.Code, "provider_status", providerErr.StatusCode)
	}
	if s.logger != nil {
		s.logger.Warn("oauth sign-in failed", attributes...)
		return
	}
	slog.Warn("oauth sign-in failed", attributes...)
}

// oauthFailureCode maps a provider-reported error to a client code. A user who
// cancelled or denied consent is not a failure of the system.
func oauthFailureCode(providerError string) string {
	switch providerError {
	case "access_denied", "consent_required", "interaction_required", "login_required":
		return "access_denied"
	case "invalid_request", "invalid_scope", "unauthorized_client", "unsupported_response_type":
		return "config_error"
	default:
		return "provider_error"
	}
}

// oauthExchangeFailureCode distinguishes a rejected authorization code from an
// unreachable provider, because the remedies differ (retry the sign-in versus
// check the deployment's connectivity).
func oauthExchangeFailureCode(err error) string {
	switch {
	case errors.Is(err, oauth.ErrEmailMissing), errors.Is(err, oauth.ErrProfileIncomplete):
		return "email_unavailable"
	case errors.Is(err, oauth.ErrProfileUnavailable):
		return "profile_unavailable"
	default:
		return "signin_failed"
	}
}

func oauthAccountFailureCode(err error) string {
	switch {
	case errors.Is(err, errOAuthEmailConflict):
		return "email_taken"
	case errors.Is(err, errOAuthIdentityConflict):
		return "already_linked"
	case errors.Is(err, errOAuthAccountInactive):
		return "account_inactive"
	default:
		return "signin_failed"
	}
}

// safeNextPath accepts only an in-app absolute path, so a crafted `next`
// parameter cannot turn the sign-in hand-off into an open redirect.
func safeNextPath(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || !strings.HasPrefix(trimmed, "/") || strings.HasPrefix(trimmed, "//") {
		return ""
	}
	if strings.ContainsAny(trimmed, "\\\r\n") {
		return ""
	}
	// A scheme-relative or absolute URL smuggled in after a valid prefix is
	// rejected too, since the value is only ever navigated to as-is.
	if parsed, err := url.Parse(trimmed); err != nil || parsed.IsAbs() || parsed.Host != "" {
		return ""
	}
	return trimmed
}

// isSecureRequest reports whether the original request reached the browser over
// HTTPS, so the state cookie can be marked Secure behind a TLS-terminating
// proxy as well as on a direct TLS connection.
func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
