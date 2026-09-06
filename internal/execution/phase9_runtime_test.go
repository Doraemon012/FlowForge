package execution

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/neyati/flowforge/internal/artifact"
	"github.com/neyati/flowforge/internal/credential"
	"github.com/neyati/flowforge/internal/workflow"
)

type captureMailer struct {
	mu       sync.Mutex
	messages []Message
}

func (m *captureMailer) Send(ctx context.Context, msg Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = append(m.messages, msg)
	return nil
}

func rawConfig(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func runTask(t *testing.T, runtime Runtime, task workflow.Task, input json.RawMessage) (json.RawMessage, error) {
	t.Helper()
	return runtime.Execute(context.Background(), task, input)
}

func TestPhase9TransformAndDelayTaskContract(t *testing.T) {
	runtime := NewBuiltinRuntime(nil)
	transform := workflow.Task{ID: "a", Type: "transform", Config: rawConfig(t, map[string]any{"output": map[string]any{"x": 1}})}
	output, err := runTask(t, runtime, transform, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("transform error: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(output, &decoded); err != nil || decoded["x"] != float64(1) {
		t.Fatalf("transform output = %s", output)
	}

	delay := workflow.Task{ID: "b", Type: "delay", Config: rawConfig(t, map[string]any{"seconds": 0})}
	output, err = runTask(t, runtime, delay, json.RawMessage(`{"v":1}`))
	if err != nil {
		t.Fatalf("delay error: %v", err)
	}
	if string(output) != `{"v":1}` {
		t.Fatalf("delay output = %s", output)
	}

	passthrough := workflow.Task{ID: "c", Type: "transform", Config: rawConfig(t, map[string]any{})}
	output, err = runTask(t, runtime, passthrough, json.RawMessage(`{"from":"dependency"}`))
	if err != nil {
		t.Fatalf("passthrough transform error: %v", err)
	}
	if string(output) != `{"from":"dependency"}` {
		t.Fatalf("passthrough transform output = %s", output)
	}
}

func TestPhase9ConditionalOperators(t *testing.T) {
	runtime := NewBuiltinRuntime(nil)
	equals := workflow.Task{ID: "c", Type: "conditional", Config: rawConfig(t, map[string]any{"field": "status", "equals": "ok"})}
	output, err := runTask(t, runtime, equals, json.RawMessage(`{"status":"ok"}`))
	if err != nil {
		t.Fatalf("conditional error: %v", err)
	}
	if string(output) != "true" {
		t.Fatalf("equals output = %s", output)
	}
	output, err = runTask(t, runtime, equals, json.RawMessage(`{"status":"bad"}`))
	if err != nil {
		t.Fatalf("conditional error: %v", err)
	}
	if string(output) != "false" {
		t.Fatalf("equals false output = %s", output)
	}

	gt := workflow.Task{ID: "d", Type: "conditional", Config: rawConfig(t, map[string]any{"field": "count", "operator": "gt", "value": 5})}
	output, err = runTask(t, runtime, gt, json.RawMessage(`{"count":10}`))
	if err != nil {
		t.Fatalf("gt error: %v", err)
	}
	if string(output) != "true" {
		t.Fatalf("gt output = %s", output)
	}
}

func TestPhase9HTTPTaskSuccessAndOutputShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	runtime := NewBuiltinRuntime(nil)
	task := workflow.Task{ID: "h", Type: "http", Config: rawConfig(t, map[string]any{"method": "GET", "url": server.URL})}
	output, err := runTask(t, runtime, task, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("http error: %v", err)
	}
	var result map[string]any
	if err := json.Unmarshal(output, &result); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if result["status_code"] != float64(200) {
		t.Fatalf("status = %v", result["status_code"])
	}
	body, _ := result["body"].(map[string]any)
	if body["ok"] != true {
		t.Fatalf("body = %v", result["body"])
	}
}

func TestPhase9HTTPTaskExternalFailureClassification(t *testing.T) {
	server500 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`boom`))
	}))
	defer server500.Close()

	runtime := NewBuiltinRuntime(nil)
	task500 := workflow.Task{ID: "h500", Type: "http", Config: rawConfig(t, map[string]any{"url": server500.URL})}
	_, err := runTask(t, runtime, task500, json.RawMessage(`{}`))
	if !IsRetryable(err) {
		t.Fatalf("500 should be retryable, got %v", err)
	}

	server400 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`bad`))
	}))
	defer server400.Close()
	task400 := workflow.Task{ID: "h400", Type: "http", Config: rawConfig(t, map[string]any{"url": server400.URL})}
	_, err = runTask(t, runtime, task400, json.RawMessage(`{}`))
	if !IsTerminal(err) {
		t.Fatalf("400 should be terminal, got %v", err)
	}
}

func TestPhase9HTTPTaskCredentialRedactionAndIdempotency(t *testing.T) {
	const secret = "super-secret-value-123"
	var gotAuth, gotIdem string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotIdem = r.Header.Get("X-Idempotency-Key")
		w.Header().Set("Authorization", "Bearer leaked-secret-in-response")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	runtime := NewBuiltinRuntime(nil, WithCredentialProvider(credential.StaticSecretProvider{"my-cred": secret}))
	task := workflow.Task{ID: "h", Type: "http", Config: rawConfig(t, map[string]any{"url": server.URL, "credential": "my-cred"})}
	input := json.RawMessage(`{"k":"v"}`)
	output, err := runTask(t, runtime, task, input)
	if err != nil {
		t.Fatalf("http error: %v", err)
	}
	if gotAuth != "Bearer "+secret {
		t.Fatalf("authorization header = %q", gotAuth)
	}
	if gotIdem == "" {
		t.Fatal("expected deterministic idempotency key header")
	}
	outputStr := string(output)
	if strings.Contains(outputStr, secret) {
		t.Fatalf("output leaked secret: %s", outputStr)
	}
	var result map[string]any
	if err := json.Unmarshal(output, &result); err != nil {
		t.Fatal(err)
	}
	headers, _ := result["headers"].(map[string]any)
	if _, present := headers["authorization"]; present {
		t.Fatalf("sensitive authorization header leaked into output")
	}
}

func TestPhase9EmailTaskUsesMailer(t *testing.T) {
	mailer := &captureMailer{}
	runtime := NewBuiltinRuntime(nil, WithMailer(mailer))
	task := workflow.Task{ID: "e", Type: "email", Config: rawConfig(t, map[string]any{"to": "a@example.com", "subject": "Hi", "body": "Hello"})}
	output, err := runTask(t, runtime, task, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("email error: %v", err)
	}
	mailer.mu.Lock()
	defer mailer.mu.Unlock()
	if len(mailer.messages) != 1 {
		t.Fatalf("mailer messages = %d", len(mailer.messages))
	}
	if mailer.messages[0].To[0] != "a@example.com" || mailer.messages[0].Subject != "Hi" {
		t.Fatalf("message = %+v", mailer.messages[0])
	}
	var decoded map[string]any
	if err := json.Unmarshal(output, &decoded); err != nil || decoded["sent"] != true {
		t.Fatalf("email output = %s", output)
	}
}

func TestPhase9OutputSizeLimit(t *testing.T) {
	runtime := NewBuiltinRuntime(nil, WithMaxOutputBytes(16))
	big := strings.Repeat("x", 100)
	task := workflow.Task{ID: "t", Type: "transform", Config: rawConfig(t, map[string]any{"output": big})}
	_, err := runTask(t, runtime, task, json.RawMessage(`{}`))
	if !IsTerminal(err) {
		t.Fatalf("oversized output should be terminal, got %v", err)
	}
}

func TestPhase9InvalidHTTPConfigIsTerminal(t *testing.T) {
	runtime := NewBuiltinRuntime(nil)
	task := workflow.Task{ID: "h", Type: "http", Config: rawConfig(t, map[string]any{})}
	_, err := runTask(t, runtime, task, json.RawMessage(`{}`))
	if !IsTerminal(err) {
		t.Fatalf("missing url should be terminal, got %v", err)
	}
}

func TestPhase9ArtifactReferenceValidation(t *testing.T) {
	valid := artifact.Reference{Type: artifact.ObjectStorageReferenceType, URI: "s3://bucket/key", Size: 12345, ContentType: "application/json"}
	if errs := artifact.ValidateReference(valid); len(errs) != 0 {
		t.Fatalf("valid reference errors = %v", errs)
	}
	invalid := artifact.Reference{URI: ""}
	if errs := artifact.ValidateReference(invalid); len(errs) == 0 {
		t.Fatal("invalid reference should have errors")
	}
	if !artifact.LooksLikeReference(rawConfig(t, map[string]any{"type": "object_storage", "uri": "s3://b/k"})) {
		t.Fatal("reference not detected")
	}
	if artifact.LooksLikeReference(rawConfig(t, map[string]any{"a": 1})) {
		t.Fatal("plain object falsely detected as reference")
	}
}
