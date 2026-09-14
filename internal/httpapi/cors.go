package httpapi

import (
	"net/http"
	"strings"
)

// corsMiddleware answers CORS preflight requests and sets the response headers a
// browser needs when the SPA is served from a different origin than the API.
//
// allowedOrigins is an explicit allow-list. The literal "*" allows any origin
// (development only). An entry beginning "*." is treated as a suffix pattern and
// matches any subdomain of the rest, which is what lets Static Web Apps per-PR
// preview environments call the API without enumerating generated hostnames.
//
// The matched origin is echoed back rather than answered with "*", so the
// response stays correct if credentialed requests are ever added.
func corsMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" || !originAllowed(origin, allowedOrigins) {
				// Same-origin request, or an origin we do not permit: no CORS
				// headers are set, so the browser blocks it. The request still
				// reaches the router so non-browser clients are unaffected.
				next.ServeHTTP(w, r)
				return
			}

			header := w.Header()
			header.Set("Access-Control-Allow-Origin", origin)
			header.Add("Vary", "Origin")
			header.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			header.Set("Access-Control-Max-Age", "600")

			if r.Method == http.MethodOptions {
				// Preflight: no body and no handler involved.
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// originAllowed reports whether an Origin header (scheme + host + optional port)
// matches the configured allow-list. Entries are exact origins
// ("https://app.example.com") or suffix patterns ("*.azurestaticapps.net").
func originAllowed(origin string, allowed []string) bool {
	host := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
	for _, entry := range allowed {
		entry = strings.TrimSpace(entry)
		switch {
		case entry == "":
			continue
		case entry == "*" || entry == origin:
			return true
		case strings.HasPrefix(entry, "*.") && strings.HasSuffix(host, entry[1:]):
			return true
		}
	}
	return false
}
