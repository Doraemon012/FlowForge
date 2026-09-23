package oauth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	// ErrStateInvalid means the state value was absent, tampered with, or signed
	// with a different key. It is never detailed to the browser.
	ErrStateInvalid = errors.New("invalid oauth state")
	// ErrStateExpired means a well-formed state was presented after its expiry.
	ErrStateExpired = errors.New("expired oauth state")
)

// State is the round-trip value carried through the provider redirect. It is
// sealed into a signed cookie rather than a bare query parameter so the browser
// cannot forge a flow it did not start.
type State struct {
	// Provider is the provider the flow started with. The callback refuses a
	// state minted for a different provider.
	Provider string `json:"p"`
	// Nonce is echoed by the provider as the `state` parameter and compared on
	// return; it is what makes the callback CSRF-safe.
	Nonce string `json:"n"`
	// Verifier is the PKCE code verifier, kept server-side in the cookie so the
	// code cannot be exchanged by anyone who merely observes the redirect.
	Verifier string `json:"v"`
	// Next is the in-app path to return to after sign-in, when the visitor was
	// interrupted on the way to a protected page.
	Next string `json:"x,omitempty"`
	// Expires is the Unix time after which the flow must not be completed. An
	// abandoned sign-in attempt stops being replayable after this point.
	Expires int64 `json:"e"`
}

// randomToken returns n bytes of cryptographic randomness, base64url-encoded
// without padding. 32 bytes yields 43 characters, which satisfies PKCE's
// 43..128 character requirement for a code verifier.
func randomToken(n int) (string, error) {
	buffer := make([]byte, n)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

// NewNonce returns a fresh opaque state nonce.
func NewNonce() (string, error) { return randomToken(32) }

// NewCodeVerifier returns a fresh PKCE code verifier.
func NewCodeVerifier() (string, error) { return randomToken(32) }

// CodeChallenge derives the S256 PKCE challenge from a verifier.
func CodeChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// SealState signs a State for transport in a cookie. The wire format matches the
// access-token format (base64url payload, '.', base64url signature) so the two
// are recognisably the same idea: a short, self-describing, tamper-evident blob.
func (s *Service) SealState(state State) (string, error) {
	if len(s.stateKey) == 0 {
		return "", errors.New("oauth state signing key is not configured")
	}
	payload, err := json.Marshal(state)
	if err != nil {
		return "", fmt.Errorf("encode oauth state: %w", err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + s.signState(encoded), nil
}

// OpenState verifies and decodes a sealed State, enforcing expiry.
func (s *Service) OpenState(sealed string) (State, error) {
	if len(s.stateKey) == 0 {
		return State{}, errors.New("oauth state signing key is not configured")
	}
	// The payload is base64url, which never contains '.', so the first separator
	// always ends it. Anything else fails the signature comparison below.
	parts := strings.SplitN(sealed, ".", 2)
	if len(parts) != 2 || !hmac.Equal([]byte(parts[1]), []byte(s.signState(parts[0]))) {
		return State{}, ErrStateInvalid
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return State{}, ErrStateInvalid
	}
	var state State
	if err := json.Unmarshal(payload, &state); err != nil {
		return State{}, ErrStateInvalid
	}
	if state.Provider == "" || state.Nonce == "" || state.Verifier == "" {
		return State{}, ErrStateInvalid
	}
	if state.Expires <= s.now().Unix() {
		return State{}, ErrStateExpired
	}
	return state, nil
}

func (s *Service) signState(encodedPayload string) string {
	mac := hmac.New(sha256.New, s.stateKey)
	_, _ = mac.Write([]byte(encodedPayload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// StateLifetime is how long a started sign-in may take to complete. It only has
// to cover the provider's own prompt, so it is generous but short.
const StateLifetime = 10 * time.Minute
