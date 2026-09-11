package workflow

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// ReviewWarning is a non-blocking advisory about a workflow definition. Warnings
// describe patterns that are structurally valid but usually wrong in practice —
// placeholder values, inline secrets, non-idempotent retries, or tasks the graph
// never connects. They never prevent saving, publishing, or running: the user is
// told what to look at, not blocked.
type ReviewWarning struct {
	TaskID   string `json:"task_id,omitempty"`
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}

// Warning severities. "warning" flags something likely to be a mistake;
// "info" flags something that is only worth a second look.
const (
	severityWarning = "warning"
	severityInfo    = "info"
)

// placeholderMarkers are substrings that identify values a generator or a person
// left behind as a stand-in for real configuration.
var placeholderMarkers = []string{
	"example.com", "example.org", "example.net",
	"changeme", "change-me", "replace-me", "replace_me", "replaceme",
	"placeholder", "your-", "your_", "todo", "xxxx",
}

// secretHeaderNames are header names whose literal values are almost always a
// credential that should live behind a FlowForge credential reference instead.
var secretHeaderNames = map[string]struct{}{
	"authorization": {}, "x-api-key": {}, "api-key": {}, "apikey": {},
	"x-auth-token": {}, "x-access-token": {}, "token": {}, "secret": {},
	"password": {}, "x-api-token": {},
}

// ReviewDefinition returns advisory warnings for a definition. It is safe to run
// on definitions that fail validation: rules that cannot be evaluated are simply
// skipped, so callers can always show the review alongside validator errors.
func ReviewDefinition(definition Definition) []ReviewWarning {
	if len(definition.Tasks) == 0 {
		return []ReviewWarning{}
	}

	dependents := dependentsByTaskID(definition)
	warnings := make([]ReviewWarning, 0)
	for _, task := range definition.Tasks {
		config, ok := decodeConfigObject(task)
		if !ok {
			continue
		}
		if warning, found := placeholderWarning(task, config); found {
			warnings = append(warnings, warning)
		}
		if task.Type == "http" {
			if warning, found := inlineSecretWarning(task, config); found {
				warnings = append(warnings, warning)
			}
			if warning, found := unsafeRetryWarning(task, config); found {
				warnings = append(warnings, warning)
			}
		}
		if task.Type == "conditional" && len(dependents[task.ID]) == 0 && len(definition.Tasks) > 1 {
			warnings = append(warnings, ReviewWarning{
				TaskID:   task.ID,
				Code:     "conditional_result_unused",
				Severity: severityWarning,
				Message: fmt.Sprintf(
					"Conditional task %q is not connected to any task, so its true/false result is never used. Connect it to the tasks it should gate.",
					task.ID,
				),
			})
		}
		if len(definition.Tasks) > 1 &&
			len(task.Dependencies) == 0 && len(dependents[task.ID]) == 0 {
			warnings = append(warnings, ReviewWarning{
				TaskID:   task.ID,
				Code:     "isolated_task",
				Severity: severityInfo,
				Message: fmt.Sprintf(
					"Task %q is not connected to any other task and runs on its own. Connect it if it should be part of the flow.",
					task.ID,
				),
			})
		}
	}

	sort.SliceStable(warnings, func(i, j int) bool {
		if warnings[i].TaskID != warnings[j].TaskID {
			return warnings[i].TaskID < warnings[j].TaskID
		}
		return warnings[i].Code < warnings[j].Code
	})
	return warnings
}

func dependentsByTaskID(definition Definition) map[string][]string {
	dependents := make(map[string][]string, len(definition.Tasks))
	for _, task := range definition.Tasks {
		for _, dependency := range task.Dependencies {
			dependents[dependency] = append(dependents[dependency], task.ID)
		}
	}
	return dependents
}

func decodeConfigObject(task Task) (map[string]json.RawMessage, bool) {
	if len(task.Config) == 0 {
		return nil, false
	}
	var config map[string]json.RawMessage
	if err := json.Unmarshal(task.Config, &config); err != nil || config == nil {
		return nil, false
	}
	return config, true
}

// placeholderWarning reports a task whose configuration still contains a value
// that looks like a stand-in rather than a real setting.
func placeholderWarning(task Task, config map[string]json.RawMessage) (ReviewWarning, bool) {
	values := make([]string, 0, 8)
	collectConfigStrings(json.RawMessage(task.Config), &values, 0)
	matches := make([]string, 0, 2)
	for _, value := range values {
		if marker, ok := placeholderMarker(value); ok && !containsString(matches, marker) {
			matches = append(matches, marker)
		}
	}
	if len(matches) == 0 {
		return ReviewWarning{}, false
	}
	return ReviewWarning{
		TaskID:   task.ID,
		Code:     "placeholder_value",
		Severity: severityWarning,
		Message: fmt.Sprintf(
			"Task %q contains placeholder values (%s). Replace them with real configuration before running.",
			task.ID, strings.Join(matches, ", "),
		),
	}, true
}

// inlineSecretWarning reports an HTTP task that pastes a credential directly into
// a header or body instead of referencing a stored credential. FlowForge
// redacts credential references but cannot redact a literal the user typed.
func inlineSecretWarning(task Task, config map[string]json.RawMessage) (ReviewWarning, bool) {
	if credential, ok := config["credential"]; ok && strings.TrimSpace(jsonString(credential)) != "" {
		return ReviewWarning{}, false
	}
	if raw, ok := config["headers"]; ok {
		var headers map[string]string
		if err := json.Unmarshal(raw, &headers); err == nil {
			for name, value := range headers {
				if _, secret := secretHeaderNames[strings.ToLower(strings.TrimSpace(name))]; secret {
					return inlineSecretWarningFor(task, fmt.Sprintf("the %q header", name)), true
				}
				if looksLikeToken(value) {
					return inlineSecretWarningFor(task, fmt.Sprintf("the %q header", name)), true
				}
			}
		}
	}
	if raw, ok := config["body"]; ok {
		var body string
		if err := json.Unmarshal(raw, &body); err == nil && looksLikeToken(body) {
			return inlineSecretWarningFor(task, "the request body"), true
		}
	}
	return ReviewWarning{}, false
}

func inlineSecretWarningFor(task Task, where string) ReviewWarning {
	return ReviewWarning{
		TaskID:   task.ID,
		Code:     "inline_secret",
		Severity: severityWarning,
		Message: fmt.Sprintf(
			"Task %q appears to contain a credential in %s. Store it as a FlowForge credential and reference it with the \"credential\" field so it stays redacted.",
			task.ID, where,
		),
	}
}

// unsafeRetryWarning reports an HTTP task whose method is not idempotent. Because
// execution is at-least-once, such a request can be sent more than once.
func unsafeRetryWarning(task Task, config map[string]json.RawMessage) (ReviewWarning, bool) {
	method := "GET"
	if raw, ok := config["method"]; ok {
		method = strings.ToUpper(strings.TrimSpace(jsonString(raw)))
	}
	if method != "POST" && method != "PATCH" {
		return ReviewWarning{}, false
	}
	return ReviewWarning{
		TaskID:   task.ID,
		Code:     "unsafe_retry",
		Severity: severityInfo,
		Message: fmt.Sprintf(
			"Task %q sends a %s request, which is not idempotent. FlowForge execution is at-least-once, so this request may be sent more than once — make it idempotent if duplicates matter.",
			task.ID, method,
		),
	}, true
}

func placeholderMarker(value string) (string, bool) {
	lower := strings.ToLower(value)
	for _, marker := range placeholderMarkers {
		if strings.Contains(lower, marker) {
			return marker, true
		}
	}
	if strings.Contains(lower, "<") && strings.Contains(lower, ">") {
		return "an angle-bracketed value", true
	}
	return "", false
}

func looksLikeToken(value string) bool {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < 8 {
		return false
	}
	lower := strings.ToLower(trimmed)
	for _, prefix := range []string{"bearer ", "basic ", "sk-", "ghp_", "xoxb-"} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

func collectConfigStrings(raw json.RawMessage, out *[]string, depth int) {
	if depth > 16 {
		return
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return
	}
	collectAnyStrings(value, out, depth)
}

func collectAnyStrings(value any, out *[]string, depth int) {
	if depth > 16 {
		return
	}
	switch typed := value.(type) {
	case string:
		*out = append(*out, typed)
	case []any:
		for _, item := range typed {
			collectAnyStrings(item, out, depth+1)
		}
	case map[string]any:
		for _, item := range typed {
			collectAnyStrings(item, out, depth+1)
		}
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
