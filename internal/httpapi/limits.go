package httpapi

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// tokenBucket is a simple in-memory per-key token-bucket rate limiter. It is
// deliberately dependency-free and per-process; a multi-instance deployment is
// expected to enforce cross-instance limits at the edge (API gateway/load
// balancer) or accept per-instance limits.
type tokenBucket struct {
	mu      sync.Mutex
	rate    float64 // tokens added per second
	burst   float64 // maximum bucket capacity
	buckets map[string]*bucket
	now     func() time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newTokenBucket(rate, burst float64) *tokenBucket {
	if rate < 0 {
		rate = 0
	}
	if burst < 1 {
		burst = 1
	}
	return &tokenBucket{
		rate:    rate,
		burst:   burst,
		buckets: make(map[string]*bucket),
		now:     time.Now,
	}
}

// allow consumes one token for the key and reports whether the request is
// permitted. A zero/disabled rate limiter always permits.
func (tb *tokenBucket) allow(key string) bool {
	if tb == nil || tb.rate <= 0 {
		return true
	}
	tb.mu.Lock()
	defer tb.mu.Unlock()
	now := tb.now()
	b, ok := tb.buckets[key]
	if !ok {
		b = &bucket{tokens: tb.burst, last: now}
		tb.buckets[key] = b
	}
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * tb.rate
		if b.tokens > tb.burst {
			b.tokens = tb.burst
		}
		b.last = now
	}
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// rateLimitMiddleware returns an http middleware that applies limiter keyed by
// the client IP. A nil or disabled limiter passes requests through unchanged.
func rateLimitMiddleware(limiter *tokenBucket) func(http.Handler) http.Handler {
	if limiter == nil || limiter.rate <= 0 {
		return func(next http.Handler) http.Handler { return next }
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !limiter.allow(clientIP(r)) {
				writeError(w, http.StatusTooManyRequests, "rate_limit_exceeded", "rate limit exceeded")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP extracts the requesting client address. It honours a single
// X-Forwarded-For entry when present; any edge proxy must sanitize this header
// to a single trusted value before forwarding.
func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		if comma := strings.Index(ip, ","); comma > 0 {
			ip = ip[:comma]
		}
		return strings.TrimSpace(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// bodyLimitMiddleware rejects requests whose declared Content-Length exceeds
// maxBytes with 413 and caps the body reader so a chunked body cannot exceed
// the limit. maxBytes <= 0 disables the limit.
func bodyLimitMiddleware(maxBytes int64) func(http.Handler) http.Handler {
	if maxBytes <= 0 {
		return func(next http.Handler) http.Handler { return next }
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > maxBytes {
				writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large", "request body too large")
				return
			}
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}
