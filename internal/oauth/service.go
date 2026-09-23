package oauth

import (
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// ErrProviderNotConfigured means the requested provider is unknown or lacks
// credentials in this deployment. The API answers with 404 so a client cannot
// distinguish the two cases (and cannot probe which providers a deployment has).
var ErrProviderNotConfigured = errors.New("oauth provider is not configured")

// providerRequestTimeout bounds every outbound call to a provider. The token and
// userinfo endpoints are the only network calls on the sign-in path, and a
// provider that stops responding must not hold a request goroutine open.
const providerRequestTimeout = 10 * time.Second

// Info is the public description of an available provider, as returned by the
// API so the client can render exactly the buttons this deployment supports.
type Info struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Service holds the configured providers and the key used to seal flow state.
// A zero-provider Service is valid and simply advertises nothing, which is how a
// deployment without OAuth credentials behaves.
type Service struct {
	providers map[string]ProviderConfig
	order     []string
	stateKey  []byte
	now       func() time.Time
	client    *http.Client
}

// NewService builds a Service from the configured providers. Providers that are
// not fully configured are dropped rather than half-enabled: a provider with no
// client secret must never appear as a sign-in option.
func NewService(providers []ProviderConfig, stateSecret string) *Service {
	service := &Service{
		providers: make(map[string]ProviderConfig, len(providers)),
		stateKey:  []byte(stateSecret),
		now:       time.Now,
		client:    &http.Client{Timeout: providerRequestTimeout},
	}
	for _, provider := range providers {
		if !provider.usable() {
			continue
		}
		if _, duplicate := service.providers[provider.ID]; duplicate {
			continue
		}
		service.providers[provider.ID] = provider
		service.order = append(service.order, provider.ID)
	}
	// A stable order keeps the rendered button list and any test assertion
	// independent of the order the providers were configured in.
	sort.Strings(service.order)
	return service
}

// Enabled reports whether a provider is available for sign-in.
func (s *Service) Enabled(providerID string) bool {
	if s == nil {
		return false
	}
	_, ok := s.providers[providerID]
	return ok
}

// Providers lists the available providers in a stable order. It never returns
// nil, so the JSON response is an empty array rather than null.
func (s *Service) Providers() []Info {
	infos := make([]Info, 0, len(s.order))
	if s == nil {
		return infos
	}
	for _, id := range s.order {
		provider := s.providers[id]
		infos = append(infos, Info{ID: provider.ID, Name: provider.Name})
	}
	return infos
}

// AuthorizationURL builds the provider redirect for a started sign-in. The
// caller supplies the state nonce (echoed back and verified on return) and the
// S256 PKCE challenge derived from the verifier held in the sealed state cookie.
func (s *Service) AuthorizationURL(providerID, state, codeChallenge string) (string, error) {
	if s == nil {
		return "", ErrProviderNotConfigured
	}
	provider, ok := s.providers[providerID]
	if !ok {
		return "", ErrProviderNotConfigured
	}
	endpoint, err := url.Parse(provider.AuthURL)
	if err != nil {
		return "", err
	}
	query := endpoint.Query()
	query.Set("client_id", provider.ClientID)
	query.Set("redirect_uri", provider.RedirectURL)
	query.Set("response_type", "code")
	query.Set("scope", strings.Join(provider.Scopes, " "))
	query.Set("state", state)
	// PKCE is used even though this is a confidential server-side client: it
	// binds the authorization code to this flow, so an intercepted code is
	// useless without the verifier that never leaves the sealed cookie.
	query.Set("code_challenge", codeChallenge)
	query.Set("code_challenge_method", "S256")
	for key, value := range provider.ExtraAuthParams {
		query.Set(key, value)
	}
	endpoint.RawQuery = query.Encode()
	return endpoint.String(), nil
}

// usable reports whether a provider has everything required to complete a flow.
func (p ProviderConfig) usable() bool {
	return strings.TrimSpace(p.ID) != "" &&
		strings.TrimSpace(p.Name) != "" &&
		strings.TrimSpace(p.ClientID) != "" &&
		strings.TrimSpace(p.ClientSecret) != "" &&
		strings.TrimSpace(p.RedirectURL) != "" &&
		strings.TrimSpace(p.AuthURL) != "" &&
		strings.TrimSpace(p.TokenURL) != "" &&
		strings.TrimSpace(p.UserInfoURL) != ""
}
