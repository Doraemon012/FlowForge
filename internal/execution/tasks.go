package execution

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/neyati/flowforge/internal/artifact"
	"github.com/neyati/flowforge/internal/credential"
	"github.com/neyati/flowforge/internal/workflow"
)

// CredentialProvider resolves secret material for a credential reference by
// name. It keeps secret values out of workflow JSON, queue payloads, logs,
// error messages, and normal API responses.
type CredentialProvider interface {
	Resolve(ctx context.Context, name string) (string, error)
}

// Message is the stable payload for the built-in email task.
type Message struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

// Mailer sends an email message. Implementations must not leak credential
// material and must classify provider errors using RetryableError or
// TerminalError.
type Mailer interface {
	Send(ctx context.Context, msg Message) error
}

// FailureClass describes why a task attempt ended and whether it may be retried.
type FailureClass string

const (
	FailureClassUnspecified FailureClass = ""
	FailureClassTransient   FailureClass = "transient"
	FailureClassTerminal    FailureClass = "terminal"
)

// RetryableError wraps an error that is safe to retry (transient provider
// errors, rate limits, worker loss, eligible timeouts).
type RetryableError struct {
	Err error
}

func (e *RetryableError) Error() string {
	if e.Err == nil {
		return "retryable task failure"
	}
	return e.Err.Error()
}

func (e *RetryableError) Unwrap() error { return e.Err }

// TerminalError wraps an error that must not be retried (invalid config,
// missing credentials, malformed input, unsupported task types).
type TerminalError struct {
	Err error
}

func (e *TerminalError) Error() string {
	if e.Err == nil {
		return "terminal task failure"
	}
	return e.Err.Error()
}

func (e *TerminalError) Unwrap() error { return e.Err }

// NewRetryableError marks an error as retryable.
func NewRetryableError(err error) error {
	if err == nil {
		return nil
	}
	return &RetryableError{Err: err}
}

// NewTerminalError marks an error as terminal.
func NewTerminalError(err error) error {
	if err == nil {
		return nil
	}
	return &TerminalError{Err: err}
}

// IsRetryable reports whether an error chain contains a RetryableError.
func IsRetryable(err error) bool {
	var target *RetryableError
	return errors.As(err, &target)
}

// IsTerminal reports whether an error chain contains a TerminalError.
func IsTerminal(err error) bool {
	var target *TerminalError
	return errors.As(err, &target)
}

// ClassifyError returns the failure class for an error.
func ClassifyError(err error) FailureClass {
	if IsRetryable(err) {
		return FailureClassTransient
	}
	return FailureClassTerminal
}

func (r *BuiltinRuntime) executeTransform(config map[string]json.RawMessage, task workflow.Task, input json.RawMessage) (json.RawMessage, error) {
	if output, ok := config["output"]; ok {
		return output, nil
	}
	return input, nil
}

func (r *BuiltinRuntime) executeDelay(ctx context.Context, config map[string]json.RawMessage, input json.RawMessage) (json.RawMessage, error) {
	var seconds float64
	if raw, ok := config["seconds"]; ok {
		if err := json.Unmarshal(raw, &seconds); err != nil || seconds < 0 {
			return nil, NewTerminalError(errors.New("delay seconds must be non-negative"))
		}
	}
	timer := time.NewTimer(time.Duration(seconds * float64(time.Second)))
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
		return input, nil
	}
}

func (r *BuiltinRuntime) executeConditional(config map[string]json.RawMessage, input json.RawMessage) (json.RawMessage, error) {
	var field string
	_ = json.Unmarshal(config["field"], &field)
	operator := "equals"
	if raw, ok := config["operator"]; ok {
		_ = json.Unmarshal(raw, &operator)
	}
	if field == "" && operator != "exists" {
		return nil, NewTerminalError(errors.New("conditional task requires field"))
	}
	var values map[string]any
	if err := json.Unmarshal(input, &values); err != nil {
		return json.RawMessage("false"), nil
	}
	actual, present := values[field]
	result := false
	switch operator {
	case "equals":
		result = present && simpleEqual(actual, configValue(config["equals"]))
	case "not_equals":
		result = present && !simpleEqual(actual, configValue(config["equals"]))
	case "gt", "lt", "gte", "lte":
		var expected float64
		_ = json.Unmarshal(config["value"], &expected)
		actualNum, ok := toFloat(actual)
		if ok {
			switch operator {
			case "gt":
				result = actualNum > expected
			case "lt":
				result = actualNum < expected
			case "gte":
				result = actualNum >= expected
			case "lte":
				result = actualNum <= expected
			}
		}
	case "contains":
		var expected string
		_ = json.Unmarshal(config["value"], &expected)
		actualStr, _ := toString(actual)
		result = strings.Contains(actualStr, expected)
	case "exists":
		result = present
	case "truthy":
		result = present && isTruthy(actual)
	default:
		return nil, NewTerminalError(fmt.Errorf("conditional task has unsupported operator: %s", operator))
	}
	return json.Marshal(result)
}

func (r *BuiltinRuntime) executeHTTP(ctx context.Context, config map[string]json.RawMessage, input json.RawMessage) (json.RawMessage, error) {
	method := "GET"
	if raw, ok := config["method"]; ok {
		_ = json.Unmarshal(raw, &method)
	}
	method = strings.ToUpper(method)
	if method != "GET" && method != "POST" && method != "PUT" && method != "PATCH" && method != "DELETE" {
		return nil, NewTerminalError(fmt.Errorf("http task has unsupported method: %s", method))
	}
	var url string
	_ = json.Unmarshal(config["url"], &url)
	if url == "" {
		return nil, NewTerminalError(errors.New("http task requires url"))
	}

	var body io.Reader
	if raw, ok := config["body"]; ok && len(raw) > 0 && method != "GET" {
		body = strings.NewReader(string(raw))
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, NewTerminalError(fmt.Errorf("http task request construction failed: %w", err))
	}
	if raw, ok := config["headers"]; ok {
		var headers map[string]string
		if err := json.Unmarshal(raw, &headers); err != nil {
			return nil, NewTerminalError(errors.New("http task headers must be an object of string values"))
		}
		for key, value := range headers {
			req.Header.Set(key, value)
		}
	}

	secrets := make([]string, 0, 1)
	if raw, ok := config["credential"]; ok {
		var name string
		_ = json.Unmarshal(raw, &name)
		if name != "" {
			if r.credentialProvider == nil {
				return nil, NewTerminalError(fmt.Errorf("http task references credential %q but no credential provider is configured", name))
			}
			secret, resolveErr := r.credentialProvider.Resolve(ctx, name)
			if resolveErr != nil {
				return nil, NewTerminalError(fmt.Errorf("http task credential resolution failed: %w", resolveErr))
			}
			secrets = append(secrets, secret)
			authType := "bearer"
			if raw, ok := config["auth"]; ok {
				_ = json.Unmarshal(raw, &authType)
			}
			switch strings.ToLower(authType) {
			case "basic":
				req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(secret)))
			case "header":
				headerName := "X-API-Key"
				if raw, ok := config["credential_header"]; ok {
					_ = json.Unmarshal(raw, &headerName)
				}
				req.Header.Set(headerName, secret)
			default:
				req.Header.Set("Authorization", "Bearer "+secret)
			}
		}
	}

	req.Header.Set("X-Idempotency-Key", deterministicIdempotencyKey(url+"\x00"+string(input)))

	client := r.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		redacted := credential.Redact(err.Error(), secrets...)
		return nil, NewRetryableError(fmt.Errorf("http task request failed: %s", redacted))
	}
	defer resp.Body.Close()

	responseBody, readErr := io.ReadAll(io.LimitReader(resp.Body, int64(r.maxOutputBytes+1)))
	if readErr != nil {
		return nil, NewRetryableError(fmt.Errorf("http task response read failed: %w", readErr))
	}
	if len(responseBody) > r.maxOutputBytes {
		return nil, NewTerminalError(fmt.Errorf("http task response exceeds %d bytes", r.maxOutputBytes))
	}

	status := resp.StatusCode
	if status >= 400 {
		redacted := credential.Redact(string(responseBody), secrets...)
		msg := fmt.Sprintf("http task returned status %d", status)
		if len(redacted) > 0 {
			msg += ": " + redacted
		}
		if status == 429 || status >= 500 {
			return nil, NewRetryableError(errors.New(msg))
		}
		return nil, NewTerminalError(errors.New(msg))
	}

	headers := make(map[string]string, len(resp.Header))
	for key, values := range resp.Header {
		if len(values) > 0 {
			headers[strings.ToLower(key)] = values[0]
		}
	}
	bodyValue := any(string(responseBody))
	if isJSON(responseBody) {
		var parsed any
		if err := json.Unmarshal(responseBody, &parsed); err == nil {
			bodyValue = parsed
		}
	}
	output := map[string]any{
		"status_code": status,
		"headers":     credential.RedactHeaders(headers),
		"body":        bodyValue,
	}
	return json.Marshal(output)
}

func (r *BuiltinRuntime) executeEmail(ctx context.Context, config map[string]json.RawMessage, input json.RawMessage) (json.RawMessage, error) {
	var toRaw, subject, body, from string
	_ = json.Unmarshal(config["to"], &toRaw)
	_ = json.Unmarshal(config["subject"], &subject)
	_ = json.Unmarshal(config["body"], &body)
	_ = json.Unmarshal(config["from"], &from)
	if strings.TrimSpace(toRaw) == "" {
		return nil, NewTerminalError(errors.New("email task requires to"))
	}
	if strings.TrimSpace(subject) == "" {
		return nil, NewTerminalError(errors.New("email task requires subject"))
	}
	to := splitAddresses(toRaw)
	if errors := validateEmailAddresses(to); len(errors) > 0 {
		return nil, NewTerminalError(fmt.Errorf("email task has invalid recipient: %s", errors[0]))
	}
	msg := Message{From: from, To: to, Subject: subject, Body: body}
	mailer := r.mailer
	if mailer == nil {
		mailer = NoopMailer{}
	}
	if err := mailer.Send(ctx, msg); err != nil {
		if IsRetryable(err) {
			return nil, err
		}
		return nil, NewTerminalError(err)
	}
	return json.Marshal(map[string]any{"sent": true, "to": to, "subject": subject})
}

func (r *BuiltinRuntime) limitOutput(output json.RawMessage) (json.RawMessage, error) {
	max := r.maxOutputBytes
	if max <= 0 {
		max = artifact.MaxOutputBytes
	}
	if len(output) > max {
		return nil, NewTerminalError(fmt.Errorf("task output exceeds %d bytes", max))
	}
	return output, nil
}

// BuiltinRuntimeOption configures an optional runtime dependency.
type BuiltinRuntimeOption func(*BuiltinRuntime)

// WithCredentialProvider wires a secret resolver for credential references.
func WithCredentialProvider(provider CredentialProvider) BuiltinRuntimeOption {
	return func(r *BuiltinRuntime) { r.credentialProvider = provider }
}

// WithMailer wires the mailer used by the email task.
func WithMailer(mailer Mailer) BuiltinRuntimeOption {
	return func(r *BuiltinRuntime) { r.mailer = mailer }
}

// WithMaxOutputBytes overrides the per-task output size limit.
func WithMaxOutputBytes(max int) BuiltinRuntimeOption {
	return func(r *BuiltinRuntime) {
		if max > 0 {
			r.maxOutputBytes = max
		}
	}
}

// LogMailer records a synthetic email send without persisting message bodies,
// which keeps sensitive message content out of logs.
type LogMailer struct {
	Logger *slog.Logger
}

// NewLogMailer creates a LogMailer.
func NewLogMailer(logger *slog.Logger) *LogMailer {
	return &LogMailer{Logger: logger}
}

// Send logs a redacted summary of the email.
func (m *LogMailer) Send(ctx context.Context, msg Message) error {
	logger := m.Logger
	if logger == nil {
		logger = slog.Default()
	}
	logger.Info("email sent", "to", msg.To, "subject", msg.Subject, "from", msg.From)
	return nil
}

// NoopMailer discards emails. It is the default when no mailer is configured.
type NoopMailer struct{}

// Send discards the message.
func (NoopMailer) Send(ctx context.Context, msg Message) error { return nil }

func deterministicIdempotencyKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func isJSON(raw []byte) bool {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return false
	}
	return (trimmed[0] == '{' || trimmed[0] == '[') && json.Valid(raw)
}

func simpleEqual(actual any, expected any) bool {
	switch actualValue := actual.(type) {
	case string:
		expectedString, ok := expected.(string)
		return ok && actualValue == expectedString
	case float64:
		expectedFloat, ok := expected.(float64)
		return ok && actualValue == expectedFloat
	case bool:
		expectedBool, ok := expected.(bool)
		return ok && actualValue == expectedBool
	default:
		return false
	}
}

func configValue(raw json.RawMessage) any {
	var value any
	if len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return string(raw)
	}
	return value
}

func toFloat(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

func toString(value any) (string, bool) {
	switch v := value.(type) {
	case string:
		return v, true
	case json.Number:
		return v.String(), true
	case float64:
		return fmt.Sprintf("%v", v), true
	default:
		return "", false
	}
}

func isTruthy(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case bool:
		return v
	case string:
		return strings.TrimSpace(v) != ""
	case float64:
		return v != 0
	default:
		return true
	}
}

func splitAddresses(raw string) []string {
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}

func validateEmailAddresses(addresses []string) []string {
	errorsFound := make([]string, 0)
	for _, address := range addresses {
		if !strings.Contains(address, "@") {
			errorsFound = append(errorsFound, address)
		}
	}
	return errorsFound
}
