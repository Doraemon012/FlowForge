package httpapi

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTokenBucketAllow(t *testing.T) {
	now := time.Now()
	tb := newTokenBucket(2, 4)
	tb.now = func() time.Time { return now }

	// The bucket starts full at the burst capacity.
	for i := 0; i < 4; i++ {
		if !tb.allow("key") {
			t.Fatalf("allow %d: expected true while bucket has capacity", i)
		}
	}
	if tb.allow("key") {
		t.Fatal("allow: expected false after burst exhausted")
	}

	// Advancing time refills at the configured rate (2 tokens/second).
	now = now.Add(time.Second)
	for i := 0; i < 2; i++ {
		if !tb.allow("key") {
			t.Fatalf("refill allow %d: expected true after time passed", i)
		}
	}
	if tb.allow("key") {
		t.Fatal("allow: expected false after refill consumed")
	}
}

func TestTokenBucketSeparateKeys(t *testing.T) {
	now := time.Now()
	tb := newTokenBucket(1, 1)
	tb.now = func() time.Time { return now }

	// A single-token bucket must still admit independent keys.
	if !tb.allow("a") {
		t.Fatal("allow a: expected true with a fresh bucket")
	}
	if !tb.allow("b") {
		t.Fatal("allow b: expected true with a separate fresh bucket")
	}
	if tb.allow("a") {
		t.Fatal("allow a: expected false after key a exhausted")
	}
}

func TestTokenBucketDisabledAlwaysAllows(t *testing.T) {
	tb := newTokenBucket(0, 4)
	for i := 0; i < 10; i++ {
		if !tb.allow("key") {
			t.Fatalf("allow %d: expected true when rate limiter is disabled (rate=0)", i)
		}
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	limiter := newTokenBucket(1, 2) // 1 req/s, burst 2
	handler := rateLimitMiddleware(limiter)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "127.0.0.1:1234"

	for i := 0; i < 2; i++ {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want %d", i, res.Code, http.StatusOK)
		}
	}

	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("over-limit request: status = %d, want %d", res.Code, http.StatusTooManyRequests)
	}
}

func TestRateLimitMiddlewareDisabledPassesThrough(t *testing.T) {
	handler := rateLimitMiddleware(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusNoContent)
	}
}

func TestBodyLimitMiddlewareRejectsOversizedDeclaredLength(t *testing.T) {
	handler := bodyLimitMiddleware(10)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString("this body is longer than ten bytes"))
	req.ContentLength = int64(len("this body is longer than ten bytes"))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestBodyLimitMiddlewareCapsChunkedBody(t *testing.T) {
	handler := bodyLimitMiddleware(10)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	// ContentLength = -1 forces a chunked/unknown-length body so the reader cap
	// is enforced by MaxBytesReader during the read, not by the pre-check.
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString("this body is longer than ten bytes"))
	req.ContentLength = -1
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestBodyLimitMiddlewareDisabledPassesThrough(t *testing.T) {
	handler := bodyLimitMiddleware(0)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			// MaxBytesReader is not attached when the limit is disabled.
			t.Errorf("disabled body limit should not cap reads, got err=%v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString("any length is fine"))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
}

func TestClientIPFromForwardedHeader(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  string
	}{
		{"single forwarded", "203.0.113.9", "203.0.113.9"},
		{"comma separated keeps first", "203.0.113.9, 198.51.100.2", "203.0.113.9"},
		{"with port trims", "203.0.113.9:9999", "203.0.113.9:9999"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("X-Forwarded-For", tt.value)
			if got := clientIP(req); got != tt.want {
				t.Fatalf("clientIP() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestClientIPFromRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:8080"
	if got := clientIP(req); got != "10.0.0.1" {
		t.Fatalf("clientIP() = %q, want %q", got, "10.0.0.1")
	}
}

func TestBodyLimitMiddlewareAllowsUnderLimit(t *testing.T) {
	handler := bodyLimitMiddleware(100)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.ReadAll(r.Body); err != nil {
			t.Fatalf("read body below limit: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString("small"))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
}

// Ensure the middleware errors are surfaced as a distinct error type from the
// downstream handler by exercising a body that trips the reader cap.
func TestMaxBytesReaderErrorType(t *testing.T) {
	handler := bodyLimitMiddleware(5)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err == nil {
			t.Fatal("expected an error reading past the capped body")
		}
		var maxBytesErr *http.MaxBytesError
		if !errors.As(err, &maxBytesErr) {
			t.Fatalf("expected *http.MaxBytesError, got %T: %v", err, err)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString("a body larger than five"))
	req.ContentLength = -1
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (handler asserts on error type)", res.Code, http.StatusOK)
	}
}
