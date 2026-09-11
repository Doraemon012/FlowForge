package workflow

import (
	"encoding/json"
	"strings"
	"testing"
)

func reviewTask(t *testing.T, id, taskType, config string, dependsOn ...string) Task {
	t.Helper()
	return Task{
		ID:           id,
		Type:         taskType,
		Config:       json.RawMessage(config),
		Dependencies: dependsOn,
	}
}

func warningCodes(warnings []ReviewWarning) []string {
	codes := make([]string, 0, len(warnings))
	for _, warning := range warnings {
		codes = append(codes, warning.TaskID+":"+warning.Code)
	}
	return codes
}

func hasCode(warnings []ReviewWarning, taskID, code string) bool {
	for _, warning := range warnings {
		if warning.TaskID == taskID && warning.Code == code {
			return true
		}
	}
	return false
}

func TestReviewCleanWorkflowHasNoWarnings(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "fetch", "http", `{"url":"https://api.internal/v1/orders","method":"GET","credential":"orders-api"}`),
		reviewTask(t, "notify", "email", `{"to":"ops@internal.dev","subject":"done"}`, "fetch"),
	}}
	if warnings := ReviewDefinition(definition); len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %v", warningCodes(warnings))
	}
}

func TestReviewFlagsPlaceholderValues(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "fetch", "http", `{"url":"https://example.com/api","method":"GET"}`),
		reviewTask(t, "notify", "email", `{"to":"ops@example.com","subject":"hi"}`, "fetch"),
	}}
	warnings := ReviewDefinition(definition)
	if !hasCode(warnings, "fetch", "placeholder_value") {
		t.Fatalf("expected placeholder warning for fetch, got %v", warningCodes(warnings))
	}
	if !hasCode(warnings, "notify", "placeholder_value") {
		t.Fatalf("expected placeholder warning for notify, got %v", warningCodes(warnings))
	}
}

func TestReviewFlagsAngleBracketPlaceholder(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "fetch", "http", `{"url":"https://api.internal/v1/<your-id>"}`),
	}}
	if !hasCode(ReviewDefinition(definition), "fetch", "placeholder_value") {
		t.Fatal("expected angle-bracket placeholder to be flagged")
	}
}

func TestReviewFlagsInlineSecret(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "fetch", "http", `{"url":"https://api.internal/v1","headers":{"Authorization":"Bearer sk-live-abcdef123"}}`),
	}}
	if !hasCode(ReviewDefinition(definition), "fetch", "inline_secret") {
		t.Fatal("expected inline_secret warning")
	}
}

func TestReviewDoesNotFlagCredentialReference(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "fetch", "http", `{"url":"https://api.internal/v1","headers":{"Authorization":"Bearer sk-live-abcdef123"},"credential":"orders-api","auth":"bearer"}`),
	}}
	if hasCode(ReviewDefinition(definition), "fetch", "inline_secret") {
		t.Fatal("a credential reference must suppress the inline_secret warning")
	}
}

func TestReviewFlagsNonIdempotentMethod(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "create", "http", `{"url":"https://api.internal/v1/orders","method":"POST"}`),
	}}
	if !hasCode(ReviewDefinition(definition), "create", "unsafe_retry") {
		t.Fatal("expected unsafe_retry warning for POST")
	}
}

func TestReviewIgnoresIdempotentMethod(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "read", "http", `{"url":"https://api.internal/v1/orders","method":"GET"}`),
	}}
	if hasCode(ReviewDefinition(definition), "read", "unsafe_retry") {
		t.Fatal("GET must not be flagged as an unsafe retry")
	}
}

func TestReviewFlagsIsolatedAndUnusedConditional(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "start", "transform", `{}`),
		reviewTask(t, "check", "conditional", `{"field":"status","operator":"exists"}`),
	}}
	warnings := ReviewDefinition(definition)
	if !hasCode(warnings, "check", "conditional_result_unused") {
		t.Fatalf("expected conditional_result_unused, got %v", warningCodes(warnings))
	}
	if !hasCode(warnings, "check", "isolated_task") {
		t.Fatalf("expected isolated_task, got %v", warningCodes(warnings))
	}
}

func TestReviewSingleTaskIsNotIsolated(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "only", "delay", `{"seconds":1}`),
	}}
	if warnings := ReviewDefinition(definition); len(warnings) != 0 {
		t.Fatalf("a single-task workflow must not report isolated_task, got %v", warningCodes(warnings))
	}
}

func TestReviewIgnoresMalformedConfig(t *testing.T) {
	definition := Definition{Tasks: []Task{
		{ID: "broken", Type: "http", Config: json.RawMessage(`"not-an-object"`)},
	}}
	if warnings := ReviewDefinition(definition); len(warnings) != 0 {
		t.Fatalf("malformed config must be skipped, got %v", warningCodes(warnings))
	}
}

func TestReviewWarningsIncludeTaskContext(t *testing.T) {
	definition := Definition{Tasks: []Task{
		reviewTask(t, "fetch", "http", `{"url":"https://example.com"}`),
	}}
	warnings := ReviewDefinition(definition)
	if len(warnings) == 0 {
		t.Fatal("expected a warning")
	}
	if !strings.Contains(warnings[0].Message, "fetch") {
		t.Fatalf("warning message should name the task: %q", warnings[0].Message)
	}
}
