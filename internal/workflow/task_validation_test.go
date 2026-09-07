package workflow

import (
	"strings"
	"testing"
)

func TestValidateTaskConfigRequiresDelaySeconds(t *testing.T) {
	errs := ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "delay", `{}`),
	}})
	if !containsError(errs, "delay task requires seconds: a") {
		t.Fatalf("errors = %v", errs)
	}

	errs = ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "delay", `{"seconds":-1}`),
	}})
	if !containsError(errs, "delay seconds must be non-negative: a") {
		t.Fatalf("errors = %v", errs)
	}
}

func TestValidateTaskConfigRequiresHTTPURL(t *testing.T) {
	errs := ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "http", `{}`),
	}})
	if !containsError(errs, "http task requires url: a") {
		t.Fatalf("errors = %v", errs)
	}

	errs = ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "http", `{"url":"not-a-url"}`),
	}})
	if !containsError(errs, "http task url must be absolute (include scheme and host): a") {
		t.Fatalf("errors = %v", errs)
	}

	errs = ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "http", `{"url":"https://example.com","method":"TRACE"}`),
	}})
	if !containsError(errs, "http task has unsupported method: a") {
		t.Fatalf("errors = %v", errs)
	}
}

func TestValidateTaskConfigRequiresEmailFields(t *testing.T) {
	errs := ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "email", `{"to":"you@example.com"}`),
	}})
	if !containsError(errs, "email task requires subject: a") {
		t.Fatalf("errors = %v", errs)
	}

	errs = ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "email", `{"to":"invalid","subject":"hi"}`),
	}})
	if !containsError(errs, "email task has invalid recipient: a") {
		t.Fatalf("errors = %v", errs)
	}
}

func TestValidateTaskConfigRequiresConditionalFieldAndValue(t *testing.T) {
	errs := ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "conditional", `{"operator":"equals","equals":"high"}`),
	}})
	if !containsError(errs, "conditional task requires field: a") {
		t.Fatalf("errors = %v", errs)
	}

	errs = ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "conditional", `{"field":"priority","operator":"gt"}`),
	}})
	if !containsError(errs, "conditional task with operator gt requires value: a") {
		t.Fatalf("errors = %v", errs)
	}

	errs = ValidateDefinition(Definition{Tasks: []Task{
		taskWithConfig("a", "conditional", `{"field":"priority","operator":"invalid"}`),
	}})
	if !containsError(errs, "conditional task has unsupported operator: invalid: a") {
		t.Fatalf("errors = %v", errs)
	}
}

func TestValidateTaskConfigAcceptsValidConfigs(t *testing.T) {
	definition := Definition{Tasks: []Task{
		taskWithConfig("a", "delay", `{"seconds":5}`),
		taskWithConfig("b", "http", `{"url":"https://example.com","method":"POST","body":{"x":1},"headers":{"Content-Type":"application/json"}}`, "a"),
		taskWithConfig("c", "email", `{"to":"you@example.com","subject":"Hello","from":"sender@example.com","body":"World"}`, "b"),
		taskWithConfig("d", "conditional", `{"field":"priority","operator":"equals","equals":"high"}`, "c"),
		taskWithConfig("e", "transform", `{"output":{"result":42}}`, "d"),
	}}
	if errs := ValidateDefinition(definition); len(errs) != 0 {
		t.Fatalf("expected no errors, got %v", errs)
	}
}

func containsError(errs []string, want string) bool {
	for _, err := range errs {
		if strings.Contains(err, want) {
			return true
		}
	}
	return false
}
