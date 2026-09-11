package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/neyati/flowforge/internal/workflow"
)

func TestGenerateDisabled(t *testing.T) {
	generator := NewGenerator(Config{})
	if generator.Enabled() {
		t.Fatal("generator with no API key must be disabled")
	}
	if _, err := generator.Generate(context.Background(), "anything"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func chatServer(t *testing.T, replies []string) *httptest.Server {
	t.Helper()
	call := 0
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing bearer token on upstream request")
		}
		content := replies[len(replies)-1]
		if call < len(replies) {
			content = replies[call]
		}
		call++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{
				"message": map[string]any{"role": "assistant", "content": content},
			}},
		})
	}))
}

func TestGenerateRepairsInvalidDefinition(t *testing.T) {
	// The first reply is structurally valid JSON but an invalid workflow (http
	// task with no url); the repair reply fixes it. Generate must return the
	// repaired, validated definition.
	server := chatServer(t, []string{
		`{"tasks":[{"id":"fetch","type":"http","config":{},"depends_on":[]}]}`,
		`{"tasks":[{"id":"fetch","type":"http","config":{"url":"https://example.com","method":"GET"},"depends_on":[]}]}`,
	})
	defer server.Close()

	generator := NewGenerator(Config{OpenAIKey: "test-key", OpenAIBaseURL: server.URL})
	definition, err := generator.Generate(context.Background(), "call an API")
	if err != nil {
		t.Fatalf("expected success after repair, got %v", err)
	}
	if len(definition.Tasks) != 1 || definition.Tasks[0].ID != "fetch" {
		t.Fatalf("unexpected definition: %+v", definition)
	}
	if validationErrors := workflow.ValidateDefinition(definition); len(validationErrors) > 0 {
		t.Fatalf("returned definition is invalid: %v", validationErrors)
	}
}

func TestGenerateFailsWhenStillInvalid(t *testing.T) {
	server := chatServer(t, []string{
		`{"tasks":[{"id":"fetch","type":"http","config":{},"depends_on":[]}]}`,
	})
	defer server.Close()

	generator := NewGenerator(Config{OpenAIKey: "test-key", OpenAIBaseURL: server.URL})
	_, err := generator.Generate(context.Background(), "call an API")
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T (%v)", err, err)
	}
	if len(validationErr.Errors) == 0 {
		t.Fatal("expected validation errors to be reported")
	}
}

func TestParseDefinitionStripsFences(t *testing.T) {
	definition, err := parseDefinition("```json\n{\"tasks\":[{\"id\":\"a\",\"type\":\"delay\",\"config\":{\"seconds\":1}}]}\n```")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(definition.Tasks) != 1 || definition.Tasks[0].Type != "delay" {
		t.Fatalf("unexpected definition: %+v", definition)
	}
}

func TestParseDefinitionRejectsNonObject(t *testing.T) {
	if _, err := parseDefinition("I could not do that."); err == nil {
		t.Fatal("expected an error for a reply without a JSON object")
	}
}
func TestEditDisabled(t *testing.T) {
	generator := NewGenerator(Config{})
	current := workflow.Definition{Tasks: []workflow.Task{
		{ID: "delay", Type: "delay", Config: json.RawMessage(`{"seconds":1}`)},
	}}
	if _, err := generator.Edit(context.Background(), current, "make it faster"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func TestEditReturnsValidatedRevision(t *testing.T) {
	var receivedBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		receivedBody = string(body)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{
				"message": map[string]any{
					"role":    "assistant",
					"content": `{"tasks":[{"id":"fetch","type":"http","config":{"url":"https://example.com"},"depends_on":[]},{"id":"notify","type":"email","config":{"to":"ops@example.com","subject":"Done"},"depends_on":["fetch"]}]}`,
				},
			}},
		})
	}))
	defer server.Close()

	current := workflow.Definition{Tasks: []workflow.Task{
		{ID: "fetch", Type: "http", Config: json.RawMessage(`{"url":"https://example.com"}`)},
	}}
	generator := NewGenerator(Config{OpenAIKey: "test-key", OpenAIBaseURL: server.URL})
	definition, err := generator.Edit(context.Background(), current, "email me the result")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if len(definition.Tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %+v", definition)
	}
	if validationErrors := workflow.ValidateDefinition(definition); len(validationErrors) > 0 {
		t.Fatalf("returned definition is invalid: %v", validationErrors)
	}
	if !strings.Contains(receivedBody, "email me the result") {
		t.Fatalf("instruction was not sent to the provider: %s", receivedBody)
	}
	if !strings.Contains(receivedBody, "https://example.com") {
		t.Fatalf("current definition was not sent to the provider: %s", receivedBody)
	}
}

func TestEditReportsPersistentlyInvalidResult(t *testing.T) {
	server := chatServer(t, []string{
		`{"tasks":[{"id":"fetch","type":"http","config":{},"depends_on":[]}]}`,
	})
	defer server.Close()

	generator := NewGenerator(Config{OpenAIKey: "test-key", OpenAIBaseURL: server.URL})
	_, err := generator.Edit(context.Background(), workflow.Definition{Tasks: []workflow.Task{
		{ID: "delay", Type: "delay", Config: json.RawMessage(`{"seconds":1}`)},
	}}, "add an http call")
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T (%v)", err, err)
	}
}
func TestProviderSelectionDefaultsToOpenAI(t *testing.T) {
	// An unset provider keeps the previous OpenAI-only deployments working.
	generator := NewGenerator(Config{OpenAIKey: "test-key"})
	if got := generator.ProviderName(); got != ProviderOpenAI {
		t.Fatalf("expected default provider %q, got %q", ProviderOpenAI, got)
	}
	if !generator.Enabled() {
		t.Fatal("openai provider with a key must be enabled")
	}
}

func TestProviderSelectionHonorsConfiguredProvider(t *testing.T) {
	// Both keys are present; the Provider field alone decides the backend.
	config := Config{
		Provider:  ProviderCohere,
		OpenAIKey: "openai-key",
		CohereKey: "cohere-key",
	}
	if got := NewGenerator(config).ProviderName(); got != ProviderCohere {
		t.Fatalf("expected provider %q, got %q", ProviderCohere, got)
	}
	config.Provider = ProviderOpenAI
	if got := NewGenerator(config).ProviderName(); got != ProviderOpenAI {
		t.Fatalf("expected provider %q, got %q", ProviderOpenAI, got)
	}
}

func TestProviderNameIsNormalized(t *testing.T) {
	generator := NewGenerator(Config{Provider: "  CoHere  ", CohereKey: "cohere-key"})
	if got := generator.ProviderName(); got != ProviderCohere {
		t.Fatalf("expected normalized provider %q, got %q", ProviderCohere, got)
	}
	if !generator.Enabled() {
		t.Fatal("cohere provider with a key must be enabled")
	}
}

func TestUnconfiguredSelectedProviderIsDisabled(t *testing.T) {
	// Selecting Cohere without a Cohere key must stay disabled even when an
	// OpenAI key exists: the feature is reported unavailable, never faked.
	generator := NewGenerator(Config{Provider: ProviderCohere, OpenAIKey: "openai-key"})
	if generator.Enabled() {
		t.Fatal("cohere must be disabled when it has no key")
	}
	if _, err := generator.Generate(context.Background(), "anything"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func TestUnknownProviderIsDisabled(t *testing.T) {
	// A typo must not silently fall back to another vendor.
	generator := NewGenerator(Config{Provider: "anthropic", OpenAIKey: "openai-key", CohereKey: "cohere-key"})
	if generator.Enabled() {
		t.Fatal("unknown provider must be disabled even when keys are present")
	}
	if got := generator.ProviderName(); got != "anthropic" {
		t.Fatalf("expected provider name to be reported verbatim, got %q", got)
	}
}

func TestSupportedProvider(t *testing.T) {
	cases := map[string]bool{
		"":        true, // defaults to openai
		"openai":  true,
		"cohere":  true,
		"OpenAI":  true,
		" CoHere": true,
		"gemini":  false,
		"azure":   false,
	}
	for name, want := range cases {
		if got := SupportedProvider(name); got != want {
			t.Errorf("SupportedProvider(%q) = %v, want %v", name, got, want)
		}
	}
}

func cohereChatServer(t *testing.T, reply string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/chat" {
			t.Errorf("unexpected cohere path %q", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing bearer token on cohere request")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message": map[string]any{
				"content": []any{map[string]any{"type": "text", "text": reply}},
			},
		})
	}))
}

func TestCohereProviderGeneratesValidatedDefinition(t *testing.T) {
	server := cohereChatServer(t, `{"tasks":[{"id":"wait","type":"delay","config":{"seconds":5},"depends_on":[]}]}`)
	defer server.Close()

	generator := NewGenerator(Config{
		Provider:      ProviderCohere,
		CohereKey:     "test-key",
		CohereBaseURL: server.URL,
	})
	if !generator.Enabled() {
		t.Fatal("cohere generator should be enabled")
	}
	definition, err := generator.Generate(context.Background(), "wait five seconds")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if len(definition.Tasks) != 1 || definition.Tasks[0].ID != "wait" {
		t.Fatalf("unexpected definition: %+v", definition)
	}
	if validationErrors := workflow.ValidateDefinition(definition); len(validationErrors) > 0 {
		t.Fatalf("returned definition is invalid: %v", validationErrors)
	}
}
