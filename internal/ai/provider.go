package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Message is one turn in a chat completion request. Providers translate this
// common shape into their vendor's wire format.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Provider is a chat-completion backend. The rest of the application depends
// only on this interface, so adding or switching a vendor never leaks into the
// generator, the HTTP layer, or the UI.
type Provider interface {
	// Name identifies the provider (one of the ProviderXXX constants).
	Name() string
	// Complete returns the assistant's reply for the given messages.
	Complete(ctx context.Context, messages []Message) (string, error)
}

const (
	requestTimeout = 60 * time.Second
	maxResponse    = 1 << 20
)

// newHTTPClient returns the client shared by provider implementations.
func newHTTPClient() *http.Client {
	return &http.Client{Timeout: requestTimeout}
}

// postJSON sends a bearer-authenticated JSON request and returns the raw
// response body. Transport failures, unreadable bodies, and non-2xx statuses are
// reported as errors that callers surface as an upstream provider failure.
func postJSON(ctx context.Context, client *http.Client, url, apiKey string, payload any) ([]byte, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+apiKey)

	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("ai provider request failed: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponse))
	if err != nil {
		return nil, fmt.Errorf("ai provider response could not be read: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("ai provider returned status %d: %s", response.StatusCode, summarize(body))
	}
	return body, nil
}

// summarize truncates an error body so provider failures stay readable.
func summarize(body []byte) string {
	text := strings.TrimSpace(string(body))
	if len(text) > 300 {
		return text[:300] + "..."
	}
	return text
}
