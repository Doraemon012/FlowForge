package oauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// stubProvider is a stand-in identity provider for the exchange path. It models
// the shape Microsoft actually has: the userinfo response identifies the account
// and the address comes from a second, resource-endpoint read. It counts the
// calls to each endpoint, which is how the tests show that second read happens
// when it is needed and is skipped when it is not.
type stubProvider struct {
	server *httptest.Server

	mu               sync.Mutex
	userinfoResponse map[string]any
	profileResponse  map[string]any
	profileStatus    int
	userinfoCalls    int
	profileCalls     int
}

func newStubProvider(t *testing.T, userinfo, profile map[string]any) *stubProvider {
	t.Helper()
	provider := &stubProvider{
		userinfoResponse: userinfo,
		profileResponse:  profile,
		profileStatus:    http.StatusOK,
	}
	provider.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			writeStubJSON(w, map[string]any{
				"access_token": "stub-access-token",
				"token_type":   "Bearer",
				"expires_in":   3600,
			})
		case "/userinfo":
			provider.recordCall(true)
			writeStubJSON(w, provider.userinfoBody())
		case "/profile":
			provider.recordCall(false)
			if status := provider.status(); status != http.StatusOK {
				w.WriteHeader(status)
				return
			}
			writeStubJSON(w, provider.profileBody())
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(provider.server.Close)
	return provider
}

func (p *stubProvider) recordCall(userinfo bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if userinfo {
		p.userinfoCalls++
		return
	}
	p.profileCalls++
}

func (p *stubProvider) userinfoBody() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.userinfoResponse
}

func (p *stubProvider) profileBody() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.profileResponse
}

func (p *stubProvider) status() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.profileStatus
}

// setProfileStatus makes the profile endpoint fail, so a sign-in that cannot
// read the address is exercised rather than assumed.
func (p *stubProvider) setProfileStatus(status int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.profileStatus = status
}

// callCounts reports how many times each endpoint was read.
func (p *stubProvider) callCounts() (userinfo, profile int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.userinfoCalls, p.profileCalls
}

// config builds the provider configuration a deployment pointed at this stub
// would hold. The scopes are the exact set the Microsoft provider requests, so
// the test drives the real permission request rather than an invented one.
func (p *stubProvider) config(providerID string) ProviderConfig {
	config := ProviderConfig{
		ID:           providerID,
		Name:         "Stub",
		ClientID:     "stub-client-id",
		ClientSecret: "stub-client-secret",
		RedirectURL:  "https://api.example.com/api/v1/auth/oauth/" + providerID + "/callback",
		AuthURL:      p.server.URL + "/authorize",
		TokenURL:     p.server.URL + "/token",
		UserInfoURL:  p.server.URL + "/userinfo",
		Scopes:       []string{ScopeOpenID, ScopeProfile, ScopeUserRead},
	}
	if providerID == ProviderMicrosoft {
		// Only the provider whose userinfo response cannot carry an address has
		// a second endpoint to read.
		config.ProfileURL = p.server.URL + "/profile"
	}
	return config
}

// exchange runs a complete authorization-code exchange against this stub,
// through the same service the API builds at startup.
func (p *stubProvider) exchange(t *testing.T, providerID string) (Profile, error) {
	t.Helper()
	service := NewService(
		[]ProviderConfig{p.config(providerID)},
		"stub-state-signing-key-0123456789abcdef",
	)
	return service.Exchange(context.Background(), providerID, "stub-code", "stub-verifier")
}

func writeStubJSON(w http.ResponseWriter, body map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}
