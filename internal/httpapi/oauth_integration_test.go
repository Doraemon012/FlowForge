package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/oauth"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/workflow"
)

// standInProvider is a minimal OpenID Connect authorization-code provider. It
// exists so the whole sign-in path — start, provider redirect, token exchange,
// userinfo, account resolution, session issue — can be exercised offline. The
// real Google and Microsoft endpoints are the one part of the flow a test
// cannot drive without live credentials, and they are deliberately thin: an
// authorization-code exchange followed by a userinfo read.
type standInProvider struct {
	server *httptest.Server

	mu            sync.Mutex
	subject       string
	email         string
	emailVerified bool
	name          string
	tokenRequests int
	// userinfoHasAddress makes the userinfo response carry the address. Google
	// does; Microsoft does not once the `email` scope is left out of the
	// request, which is what forces the address to be read from the profile
	// endpoint instead.
	userinfoHasAddress bool
}

func newStandInProvider(t *testing.T) *standInProvider {
	t.Helper()
	provider := &standInProvider{
		subject:            "stand-in-subject",
		email:              "stand-in@example.com",
		emailVerified:      true,
		name:               "Stand In",
		userinfoHasAddress: true,
	}
	provider.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			provider.recordTokenRequest()
			if err := r.ParseForm(); err != nil || r.Form.Get("code") != "good-code" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":"invalid_grant","error_description":"the code was rejected"}`)
				return
			}
			// PKCE must have travelled with the exchange; a verifier-less or
			// mismatched request would never succeed against a real provider.
			if r.Form.Get("code_verifier") == "" {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":"invalid_request"}`)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"access_token":"provider-access-token","token_type":"Bearer","expires_in":3600}`)
		case "/userinfo":
			if r.Header.Get("Authorization") != "Bearer provider-access-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			subject, email, verified, name, hasAddress := provider.identity()
			claims := map[string]any{"sub": subject, "name": name}
			if hasAddress {
				claims["email"] = email
				claims["email_verified"] = verified
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(claims)
		case "/profile":
			// The Graph user resource as the sign-in path reads it: the account's
			// SMTP address, its user principal name, and its display name.
			if r.Header.Get("Authorization") != "Bearer provider-access-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_, email, _, name, _ := provider.identity()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"mail":              email,
				"userPrincipalName": email,
				"displayName":       name,
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(provider.server.Close)
	return provider
}

func (p *standInProvider) setIdentity(subject, email string, verified bool, name string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.subject, p.email, p.emailVerified, p.name = subject, email, verified, name
}

// withoutUserinfoAddress makes the userinfo response carry no address, which is
// the shape Microsoft has once `email` is not requested. The address is then
// only available from the profile endpoint, exactly as it is at Microsoft.
func (p *standInProvider) withoutUserinfoAddress() *standInProvider {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.userinfoHasAddress = false
	return p
}

func (p *standInProvider) identity() (subject, email string, verified bool, name string, hasAddress bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.subject, p.email, p.emailVerified, p.name, p.userinfoHasAddress
}

func (p *standInProvider) recordTokenRequest() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.tokenRequests++
}

func (p *standInProvider) tokenRequestCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.tokenRequests
}

// googleConfig is the Google provider shape: one userinfo read, and it carries
// the address itself. The scopes are the ones the real provider composes, so
// this stand-in cannot drift from what the application actually requests.
func (p *standInProvider) googleConfig() oauth.ProviderConfig {
	return oauth.ProviderConfig{
		ID:           oauth.ProviderGoogle,
		Name:         "Google",
		ClientID:     "stand-in-client-id",
		ClientSecret: "stand-in-client-secret",
		RedirectURL:  "http://api.test/api/v1/auth/oauth/google/callback",
		AuthURL:      p.server.URL + "/authorize",
		TokenURL:     p.server.URL + "/token",
		UserInfoURL:  p.server.URL + "/userinfo",
		Scopes:       []string{oauth.ScopeOpenID, oauth.ScopeEmail, oauth.ScopeProfile},
	}
}

// microsoftConfig is the Microsoft provider shape: the userinfo read identifies
// the account, and the address comes from a second, Graph-style profile read
// under User.Read. The scopes are exactly the three the real provider requests.
func (p *standInProvider) microsoftConfig() oauth.ProviderConfig {
	return oauth.ProviderConfig{
		ID:           oauth.ProviderMicrosoft,
		Name:         "Microsoft",
		ClientID:     "stand-in-client-id",
		ClientSecret: "stand-in-client-secret",
		RedirectURL:  "http://api.test/api/v1/auth/oauth/microsoft/callback",
		AuthURL:      p.server.URL + "/authorize",
		TokenURL:     p.server.URL + "/token",
		UserInfoURL:  p.server.URL + "/userinfo",
		ProfileURL:   p.server.URL + "/profile",
		Scopes:       []string{oauth.ScopeOpenID, oauth.ScopeProfile, oauth.ScopeUserRead},
		ExtraAuthParams: map[string]string{
			"response_mode": "query",
		},
	}
}

// oauthTestServer wires a server with the Google provider pointed at the
// stand-in, which is what most of these tests exercise.
func oauthTestServer(t *testing.T, provider *standInProvider, frontendRedirect string) (http.Handler, user.IdentityRepository) {
	t.Helper()
	return oauthTestServerWith(t, []oauth.ProviderConfig{provider.googleConfig()}, frontendRedirect)
}

// oauthTestServerWith wires a server with an arbitrary provider configuration,
// so the Microsoft shape — two identity reads under different permissions — can
// be driven through the same API. It skips unless a database is available,
// matching the other integration tests in this package.
func oauthTestServerWith(t *testing.T, providers []oauth.ProviderConfig, frontendRedirect string) (http.Handler, user.IdentityRepository) {
	t.Helper()

	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	pool, err := db.Open(context.Background(), databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(pool.Close)

	service := oauth.NewService(providers, "oauth-state-signing-key-for-tests-0123456789")

	identities := user.NewPostgresIdentityRepository(pool)
	server := NewExecutionServer(
		pool,
		user.NewPostgresRepository(pool),
		project.NewPostgresRepository(pool),
		workflow.NewPostgresRepository(pool),
		nil, // executions
		nil, // execution engine
		auth.NewTokenService("01234567890123456789012345678901"),
		nil, // schedules
		nil, // webhooks
		nil, // idempotency
		slog.New(slog.NewJSONHandler(io.Discard, nil)),
	)
	server.SetOAuth(service, identities, frontendRedirect)
	return server.Router(), identities
}

// startFlow begins a sign-in and returns the sealed state cookie plus the query
// the browser would have followed to the provider. The `state` from that query
// is what a real provider echoes back, so the test carries it forward exactly as
// the round-trip does rather than inventing one.
func startFlow(t *testing.T, handler http.Handler, next string) (*http.Cookie, url.Values) {
	t.Helper()
	return startFlowFor(t, handler, oauth.ProviderGoogle, next)
}

// startFlowFor starts a sign-in with a chosen provider.
func startFlowFor(t *testing.T, handler http.Handler, providerID, next string) (*http.Cookie, url.Values) {
	t.Helper()

	startPath := "/api/v1/auth/oauth/" + providerID + "/start"
	if next != "" {
		startPath += "?next=" + url.QueryEscape(next)
	}
	start := httptest.NewRecorder()
	handler.ServeHTTP(start, httptest.NewRequest(http.MethodGet, startPath, nil))
	if start.Code != http.StatusFound {
		t.Fatalf("start status = %d, body = %s", start.Code, start.Body.String())
	}

	providerRedirect := queryOf(t, start.Header().Get("Location"))
	if providerRedirect.Get("state") == "" {
		t.Fatal("the provider redirect carried no state parameter")
	}
	return stateCookie(t, start), providerRedirect
}

// signIn drives a complete start -> callback round-trip and returns the
// fragment the API handed back to the SPA.
func signIn(t *testing.T, handler http.Handler, next string) url.Values {
	t.Helper()
	return signInFor(t, handler, oauth.ProviderGoogle, next)
}

// signInFor drives a complete round-trip with a chosen provider.
func signInFor(t *testing.T, handler http.Handler, providerID, next string) url.Values {
	t.Helper()
	cookie, providerRedirect := startFlowFor(t, handler, providerID, next)
	return callbackFor(t, handler, providerID, cookie, providerRedirect.Get("state"), "good-code")
}

// stateCookie returns the sealed flow-state cookie the start route set, checking
// the protections the cookie is relied on for.
func stateCookie(t *testing.T, response *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name != oauthStateCookieName {
			continue
		}
		if cookie.Value == "" {
			t.Fatal("the state cookie is empty")
		}
		if !cookie.HttpOnly {
			t.Error("the state cookie must be HttpOnly: it carries the PKCE verifier")
		}
		if cookie.Path != oauthStateCookiePath {
			t.Errorf("state cookie path = %q, want %q", cookie.Path, oauthStateCookiePath)
		}
		return cookie
	}
	t.Fatal("the start route did not set a state cookie")
	return nil
}

// callbackWith replays a successful callback.
func callbackWith(t *testing.T, handler http.Handler, cookie *http.Cookie, state, code string) url.Values {
	t.Helper()
	return callbackFor(t, handler, oauth.ProviderGoogle, cookie, state, code)
}

// callbackFor replays a successful callback against a chosen provider.
func callbackFor(t *testing.T, handler http.Handler, providerID string, cookie *http.Cookie, state, code string) url.Values {
	t.Helper()
	return callbackQueryFor(t, handler, providerID, cookie, url.Values{"code": {code}, "state": {state}})
}

// callbackQuery replays the callback with an arbitrary query, which is what the
// provider sends for both a completed sign-in and a refusal. A nil cookie models
// a callback that did not come from a flow this deployment started.
func callbackQuery(t *testing.T, handler http.Handler, cookie *http.Cookie, query url.Values) url.Values {
	t.Helper()
	return callbackQueryFor(t, handler, oauth.ProviderGoogle, cookie, query)
}

// callbackQueryFor replays a callback for a chosen provider with an arbitrary
// query.
func callbackQueryFor(t *testing.T, handler http.Handler, providerID string, cookie *http.Cookie, query url.Values) url.Values {
	t.Helper()

	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/"+providerID+"/callback?"+query.Encode(), nil)
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusFound {
		t.Fatalf("callback status = %d, body = %s", response.Code, response.Body.String())
	}
	return fragmentOf(t, response.Header().Get("Location"))
}

// queryOf parses the query string of an absolute URL.
func queryOf(t *testing.T, location string) url.Values {
	t.Helper()
	parsed, err := url.Parse(location)
	if err != nil {
		t.Fatalf("parse redirect %q: %v", location, err)
	}
	return parsed.Query()
}

// fragmentOf parses the fragment of the frontend hand-off URL.
func fragmentOf(t *testing.T, location string) url.Values {
	t.Helper()
	at := strings.Index(location, "#")
	if at < 0 {
		t.Fatalf("redirect %q carries no fragment", location)
	}
	values, err := url.ParseQuery(location[at+1:])
	if err != nil {
		t.Fatalf("parse fragment of %q: %v", location, err)
	}
	return values
}

// uniqueName returns a value unique to this run, so a repeated run against the
// same database never collides with an earlier one's rows.
func uniqueName(t *testing.T, prefix string) string {
	t.Helper()
	return prefix + "-" + strings.ReplaceAll(t.Name(), "/", "-") + "-" + time.Now().Format("150405.000000000")
}

// meFor reads the profile a session token resolves to, through the ordinary
// authenticated endpoint.
func meFor(t *testing.T, handler http.Handler, token string) meResponse {
	t.Helper()
	response := requestJSON(handler, http.MethodGet, "/api/v1/me", nil, token)
	if response.Code != http.StatusOK {
		t.Fatalf("GET /me status = %d, body = %s", response.Code, response.Body.String())
	}
	var profile meResponse
	if err := json.NewDecoder(response.Body).Decode(&profile); err != nil {
		t.Fatalf("decode profile: %v", err)
	}
	return profile
}

// The whole path: a first-time visitor signs in with a provider and comes back
// with a working FlowForge session, an account, and a recorded link.
func TestOAuthSignInCreatesAccountLinksIdentityAndIssuesSession(t *testing.T) {
	provider := newStandInProvider(t)
	handler, identities := oauthTestServer(t, provider, "http://app.test/auth/callback")

	subject := uniqueName(t, "subject")
	email := uniqueName(t, "person") + "@example.com"
	provider.setIdentity(subject, email, true, "Social Person")

	fragment := signIn(t, handler, "/app/projects")

	if code := fragment.Get("error"); code != "" {
		t.Fatalf("sign-in failed with %q", code)
	}
	token := fragment.Get("access_token")
	if token == "" {
		t.Fatal("the hand-off carried no access token")
	}
	if got := fragment.Get("token_type"); got != "Bearer" {
		t.Errorf("token_type = %q, want Bearer", got)
	}
	// `next` has to survive the round-trip so the visitor resumes where they
	// were interrupted rather than always landing on the dashboard.
	if got := fragment.Get("next"); got != "/app/projects" {
		t.Errorf("next = %q, want /app/projects", got)
	}
	userID := fragment.Get("user_id")
	if userID == "" {
		t.Fatal("the hand-off carried no user id")
	}

	// The token must work against the ordinary authenticated API: that is what
	// makes this a real session rather than a token in a URL.
	profile := meFor(t, handler, token)
	if profile.ID.String() != userID {
		t.Errorf("session user = %s, want %s", profile.ID, userID)
	}
	// The address is stored normalised, exactly as the register and login paths
	// store it, so a later password lookup for the same address agrees with the
	// account a provider sign-in created.
	if want := strings.ToLower(email); profile.Email != want {
		t.Errorf("account email = %q, want %q", profile.Email, want)
	}
	if profile.DisplayName != "Social Person" {
		t.Errorf("display name = %q, want %q", profile.DisplayName, "Social Person")
	}
	if profile.IsTrial {
		t.Error("a social sign-in must not produce a trial account")
	}

	// The link is what makes the next sign-in resolve to this same person.
	identity, err := identities.GetBySubject(context.Background(), oauth.ProviderGoogle, subject)
	if err != nil {
		t.Fatalf("the provider identity was not linked: %v", err)
	}
	if identity.UserID.String() != userID {
		t.Errorf("linked user = %s, want %s", identity.UserID, userID)
	}
}

// Signing in twice with the same provider account resolves to the same
// FlowForge account, even after the provider's reported address changes: the
// subject is the link key, because an email can change hands.
func TestOAuthSignInIsIdempotentAndFollowsTheProviderSubject(t *testing.T) {
	provider := newStandInProvider(t)
	handler, _ := oauthTestServer(t, provider, "http://app.test/auth/callback")

	subject := uniqueName(t, "subject")
	provider.setIdentity(subject, uniqueName(t, "first")+"@example.com", true, "Repeat Person")

	first := signIn(t, handler, "")
	if code := first.Get("error"); code != "" {
		t.Fatalf("first sign-in failed with %q", code)
	}

	provider.setIdentity(subject, uniqueName(t, "second")+"@example.com", true, "Repeat Person")

	second := signIn(t, handler, "")
	if code := second.Get("error"); code != "" {
		t.Fatalf("second sign-in failed with %q", code)
	}
	if second.Get("user_id") != first.Get("user_id") {
		t.Errorf("second sign-in resolved to %s, want the same account %s", second.Get("user_id"), first.Get("user_id"))
	}
}

// An existing password account is adopted rather than duplicated when the
// provider vouches that the signed-in person controls its address.
func TestOAuthSignInAdoptsExistingAccountWhenProviderVerifiesEmail(t *testing.T) {
	provider := newStandInProvider(t)
	handler, _ := oauthTestServer(t, provider, "http://app.test/auth/callback")

	email := uniqueName(t, "member") + "@example.com"
	existing := meFor(t, handler, registerAndLogin(t, handler, email, "Password Person"))

	provider.setIdentity(uniqueName(t, "subject"), email, true, "Password Person")

	fragment := signIn(t, handler, "")
	if code := fragment.Get("error"); code != "" {
		t.Fatalf("sign-in failed with %q", code)
	}
	if fragment.Get("user_id") != existing.ID.String() {
		t.Errorf("resolved to %s, want the existing account %s", fragment.Get("user_id"), existing.ID)
	}

	// The account was linked, not replaced: the password must still work.
	response := requestJSON(handler, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email":    email,
		"password": "correct horse battery staple",
	}, "")
	if response.Code != http.StatusOK {
		t.Fatalf("password login after linking status = %d, body = %s", response.Code, response.Body.String())
	}
}

// A provider address that is not vouched for must never adopt a password
// account: anyone able to attach an unverified address at a provider could
// otherwise sign in as its owner. The sign-in is refused and nothing is linked.
func TestOAuthSignInRefusesUnverifiedEmailOnPasswordAccount(t *testing.T) {
	provider := newStandInProvider(t)
	handler, identities := oauthTestServer(t, provider, "http://app.test/auth/callback")

	email := uniqueName(t, "member") + "@example.com"
	meFor(t, handler, registerAndLogin(t, handler, email, "Password Person"))

	subject := uniqueName(t, "subject")
	provider.setIdentity(subject, email, false, "Impostor")

	fragment := signIn(t, handler, "")
	if got := fragment.Get("error"); got != "email_taken" {
		t.Fatalf("error = %q, want email_taken", got)
	}
	if fragment.Get("access_token") != "" {
		t.Error("a refused sign-in must not hand back a session")
	}

	// The refusal is total: no link was recorded, so a later retry cannot
	// short-circuit past the email check via the subject.
	if _, err := identities.GetBySubject(context.Background(), oauth.ProviderGoogle, subject); !errors.Is(err, user.ErrNotFound) {
		t.Errorf("identity lookup err = %v, want %v", err, user.ErrNotFound)
	}
}

// The callback only completes for a flow this deployment started. Every way of
// presenting a state it did not mint is refused.
func TestOAuthCallbackRejectsStateItDidNotMint(t *testing.T) {
	provider := newStandInProvider(t)
	handler, _ := oauthTestServer(t, provider, "http://app.test/auth/callback")

	for _, testCase := range []struct {
		name   string
		cookie *http.Cookie
		state  string
	}{
		{name: "no state cookie at all", cookie: nil, state: "invented-state"},
		{name: "tampered cookie", cookie: tamperedCookie(t, handler), state: "invented-state"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			fragment := callbackWith(t, handler, testCase.cookie, testCase.state, "good-code")
			if got := fragment.Get("error"); got != "state_invalid" {
				t.Fatalf("error = %q, want state_invalid", got)
			}
			if fragment.Get("provider") != oauth.ProviderGoogle {
				t.Errorf("provider = %q, want %q", fragment.Get("provider"), oauth.ProviderGoogle)
			}
		})
	}

	// A genuine cookie presented with a state the provider never echoed is a
	// CSRF attempt and is rejected on the nonce comparison.
	t.Run("nonce mismatch", func(t *testing.T) {
		cookie, _ := startFlow(t, handler, "")
		fragment := callbackWith(t, handler, cookie, "not-the-nonce", "good-code")
		if got := fragment.Get("error"); got != "state_invalid" {
			t.Fatalf("error = %q, want state_invalid", got)
		}
	})
}

// tamperedCookie returns a real state cookie with one byte of its sealed value
// changed, which the signature check must catch.
func tamperedCookie(t *testing.T, handler http.Handler) *http.Cookie {
	t.Helper()
	cookie, _ := startFlow(t, handler, "")
	replacement := "A"
	if cookie.Value[0:1] == replacement {
		replacement = "B"
	}
	return &http.Cookie{
		Name:  cookie.Name,
		Value: replacement + cookie.Value[1:],
		Path:  cookie.Path,
	}
}

// Cancelling at the provider is a normal choice, not a fault, and the visitor
// still returns to where they were headed.
func TestOAuthCallbackReportsCancellation(t *testing.T) {
	provider := newStandInProvider(t)
	handler, _ := oauthTestServer(t, provider, "http://app.test/auth/callback")

	cookie, providerRedirect := startFlow(t, handler, "/app/executions")

	fragment := callbackQuery(t, handler, cookie, url.Values{
		"error": {"access_denied"},
		"state": {providerRedirect.Get("state")},
	})

	if got := fragment.Get("error"); got != "access_denied" {
		t.Fatalf("error = %q, want access_denied", got)
	}
	if got := fragment.Get("next"); got != "/app/executions" {
		t.Errorf("next = %q, want /app/executions", got)
	}
}

// A rejected authorization code fails the sign-in without creating anything:
// no account, no link, no session.
func TestOAuthCallbackRejectsBadAuthorizationCode(t *testing.T) {
	provider := newStandInProvider(t)
	handler, identities := oauthTestServer(t, provider, "http://app.test/auth/callback")

	subject := uniqueName(t, "subject")
	provider.setIdentity(subject, uniqueName(t, "person")+"@example.com", true, "Never Signed In")

	fragment := signInWithCode(t, handler, "rejected-code")

	if got := fragment.Get("error"); got != "signin_failed" {
		t.Fatalf("error = %q, want signin_failed", got)
	}
	if fragment.Get("access_token") != "" {
		t.Error("a failed exchange must not hand back a session")
	}
	if _, err := identities.GetBySubject(context.Background(), oauth.ProviderGoogle, subject); !errors.Is(err, user.ErrNotFound) {
		t.Errorf("identity lookup err = %v, want %v", err, user.ErrNotFound)
	}
}

// signInWithCode runs the round-trip with a chosen authorization code.
func signInWithCode(t *testing.T, handler http.Handler, code string) url.Values {
	t.Helper()
	cookie, providerRedirect := startFlow(t, handler, "")
	return callbackWith(t, handler, cookie, providerRedirect.Get("state"), code)
}

// The client renders exactly the providers the server offers, so it never shows
// a button for a provider this deployment cannot authenticate against.
func TestOAuthProviderDiscoveryMatchesConfiguration(t *testing.T) {
	provider := newStandInProvider(t)
	handler, _ := oauthTestServer(t, provider, "http://app.test/auth/callback")

	response := requestJSON(handler, http.MethodGet, "/api/v1/auth/oauth/providers", nil, "")
	if response.Code != http.StatusOK {
		t.Fatalf("providers status = %d, body = %s", response.Code, response.Body.String())
	}
	var body struct {
		Providers []oauth.Info `json:"providers"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode providers: %v", err)
	}
	if len(body.Providers) != 1 || body.Providers[0].ID != oauth.ProviderGoogle {
		t.Fatalf("providers = %+v, want only %s", body.Providers, oauth.ProviderGoogle)
	}

	// A provider that is not configured cannot be started, and the response is
	// a 404 rather than a redirect into a flow that could never complete.
	if unknown := requestJSON(handler, http.MethodGet, "/api/v1/auth/oauth/microsoft/start", nil, ""); unknown.Code != http.StatusNotFound {
		t.Errorf("unconfigured provider start status = %d, want %d", unknown.Code, http.StatusNotFound)
	}
}

// The Microsoft flow end to end, with the provider's real shape: the userinfo
// response carries no address (it cannot, once `email` is left out of the
// request), so the address comes from the second read the User.Read permission
// authorizes, while the account is still keyed by the subject the userinfo
// response returned. This is the path that would break Microsoft sign-in if the
// permission change were not paired with a way to read the address.
func TestOAuthMicrosoftSignInReadsTheAddressFromTheProfileEndpoint(t *testing.T) {
	provider := newStandInProvider(t).withoutUserinfoAddress()
	handler, identities := oauthTestServerWith(
		t,
		[]oauth.ProviderConfig{provider.microsoftConfig()},
		"http://app.test/auth/callback",
	)

	subject := uniqueName(t, "subject")
	email := uniqueName(t, "person") + "@contoso.com"
	provider.setIdentity(subject, email, false, "Work Person")

	fragment := signInFor(t, handler, oauth.ProviderMicrosoft, "/app")
	if code := fragment.Get("error"); code != "" {
		t.Fatalf("sign-in failed with %q", code)
	}
	token := fragment.Get("access_token")
	if token == "" {
		t.Fatal("the hand-off carried no access token")
	}

	// The account is real and usable: the token works against the ordinary API,
	// and the address it was created from is the one the profile read returned.
	profile := meFor(t, handler, token)
	if want := strings.ToLower(email); profile.Email != want {
		t.Errorf("account email = %q, want %q", profile.Email, want)
	}
	if profile.DisplayName != "Work Person" {
		t.Errorf("display name = %q, want %q", profile.DisplayName, "Work Person")
	}

	// The link is keyed by the userinfo subject, so a later sign-in resolves to
	// this account even if the address the profile read returns changes.
	identity, err := identities.GetBySubject(context.Background(), oauth.ProviderMicrosoft, subject)
	if err != nil {
		t.Fatalf("the provider identity was not linked: %v", err)
	}
	if identity.UserID.String() != fragment.Get("user_id") {
		t.Errorf("linked user = %s, want %s", identity.UserID, fragment.Get("user_id"))
	}

	second := signInFor(t, handler, oauth.ProviderMicrosoft, "")
	if code := second.Get("error"); code != "" {
		t.Fatalf("second sign-in failed with %q", code)
	}
	if second.Get("user_id") != fragment.Get("user_id") {
		t.Errorf("second sign-in resolved to %s, want the same account %s", second.Get("user_id"), fragment.Get("user_id"))
	}
}
