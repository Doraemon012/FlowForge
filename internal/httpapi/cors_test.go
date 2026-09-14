package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOriginAllowed(t *testing.T) {
	allowed := []string{
		"https://app.example.com",
		"https://www.example.com",
		"*.azurestaticapps.net",
	}
	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{"exact match", "https://app.example.com", true},
		{"exact match second entry", "https://www.example.com", true},
		{"suffix pattern subdomain", "https://kind-sand-0a1b2c3d.1.azurestaticapps.net", true},
		{"suffix pattern nested", "https://pr-42.app.1.azurestaticapps.net", true},
		{"unrelated origin", "https://evil.example.com", false},
		{"scheme mismatch is not an exact match", "http://app.example.com", false},
		{"suffix must be a real subdomain", "https://notazurestaticapps.net", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := originAllowed(tt.origin, allowed); got != tt.want {
				t.Fatalf("originAllowed(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

func TestOriginAllowedWildcard(t *testing.T) {
	if !originAllowed("https://anything.example", []string{"*"}) {
		t.Fatal("expected the wildcard entry to allow any origin")
	}
}

func TestCORSDisabledWithoutAllowList(t *testing.T) {
	var reached bool
	handler := corsMiddleware(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
	req.Header.Set("Origin", "https://app.example.com")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if !reached {
		t.Fatal("expected the request to reach the handler when CORS is disabled")
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty when CORS is disabled", got)
	}
}

func TestCORSDisallowedOriginGetsNoHeaders(t *testing.T) {
	var reached bool
	handler := corsMiddleware([]string{"https://app.example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if !reached {
		t.Fatal("a disallowed origin must still reach the router so non-browser clients work")
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty for a disallowed origin", got)
	}
}

func TestCORSPreflightShortCircuits(t *testing.T) {
	var reached bool
	handler := corsMiddleware([]string{"https://app.example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/projects", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if reached {
		t.Fatal("preflight must be answered by the middleware, not passed to the handler")
	}
	if res.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", res.Code, http.StatusNoContent)
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want the request origin echoed back", got)
	}
	if got := res.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatal("expected Access-Control-Allow-Headers to be set on a preflight response")
	}
}

func TestCORSActualRequestEchoesOrigin(t *testing.T) {
	handler := corsMiddleware([]string{"https://app.example.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("Origin", "https://app.example.com")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want the request origin", got)
	}
	if got := res.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("Vary = %q, want %q so caches key on the origin", got, "Origin")
	}
}
