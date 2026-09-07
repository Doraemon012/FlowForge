package workflow

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// validateTaskConfig validates task-type-specific configuration semantics.
// It is called after the structural checks (ID, supported type, JSON-object
// config) pass, so a malformed config map is not expected here. Errors follow
// the same "<description>: <task id>" format as the structural errors so the
// frontend can surface them consistently.
func validateTaskConfig(task Task, config map[string]json.RawMessage) []string {
	switch task.Type {
	case "delay":
		return validateDelayConfig(task.ID, config)
	case "conditional":
		return validateConditionalConfig(task.ID, config)
	case "http":
		return validateHTTPConfig(task.ID, config)
	case "email":
		return validateEmailConfig(task.ID, config)
	case "transform":
		// Transform has no required config; a missing output is a valid
		// passthrough. The config-object check in the structural loop is enough.
		return nil
	default:
		return nil
	}
}

func validateDelayConfig(taskID string, config map[string]json.RawMessage) []string {
	raw, ok := config["seconds"]
	if !ok {
		return []string{fmt.Sprintf("delay task requires seconds: %s", taskID)}
	}
	var seconds float64
	if err := json.Unmarshal(raw, &seconds); err != nil {
		return []string{fmt.Sprintf("delay seconds must be a number: %s", taskID)}
	}
	if seconds < 0 {
		return []string{fmt.Sprintf("delay seconds must be non-negative: %s", taskID)}
	}
	return nil
}

func validateConditionalConfig(taskID string, config map[string]json.RawMessage) []string {
	field, fieldOK := config["field"]
	if !fieldOK || strings.TrimSpace(jsonString(field)) == "" {
		return []string{fmt.Sprintf("conditional task requires field: %s", taskID)}
	}
	operator := "equals"
	if raw, ok := config["operator"]; ok {
		operator = jsonString(raw)
	}
	switch operator {
	case "equals", "not_equals":
		if _, ok := config["equals"]; !ok {
			return []string{fmt.Sprintf("conditional task with operator %s requires equals value: %s", operator, taskID)}
		}
	case "gt", "lt", "gte", "lte", "contains":
		value, ok := config["value"]
		if !ok {
			return []string{fmt.Sprintf("conditional task with operator %s requires value: %s", operator, taskID)}
		}
		if operator != "contains" {
			var num float64
			if err := json.Unmarshal(value, &num); err != nil {
				return []string{fmt.Sprintf("conditional task with operator %s requires a numeric value: %s", operator, taskID)}
			}
		}
	case "exists", "truthy":
		// No extra comparison value required.
	default:
		return []string{fmt.Sprintf("conditional task has unsupported operator: %s: %s", operator, taskID)}
	}
	return nil
}

func validateHTTPConfig(taskID string, config map[string]json.RawMessage) []string {
	rawURL, ok := config["url"]
	if !ok {
		return []string{fmt.Sprintf("http task requires url: %s", taskID)}
	}
	urlString := jsonString(rawURL)
	if strings.TrimSpace(urlString) == "" {
		return []string{fmt.Sprintf("http task requires url: %s", taskID)}
	}
	parsed, err := url.Parse(urlString)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return []string{fmt.Sprintf("http task url must be absolute (include scheme and host): %s", taskID)}
	}

	if raw, ok := config["method"]; ok {
		method := strings.ToUpper(jsonString(raw))
		switch method {
		case "GET", "POST", "PUT", "PATCH", "DELETE":
		default:
			return []string{fmt.Sprintf("http task has unsupported method: %s", taskID)}
		}
	}

	if raw, ok := config["headers"]; ok && len(raw) > 0 {
		var headers map[string]string
		if err := json.Unmarshal(raw, &headers); err != nil {
			return []string{fmt.Sprintf("http task headers must be an object of string values: %s", taskID)}
		}
	}

	if raw, ok := config["body"]; ok && len(raw) > 0 {
		var stringValue string
		if err := json.Unmarshal(raw, &stringValue); err != nil {
			// Body may be arbitrary JSON; accept it if it is valid JSON.
			if !json.Valid(raw) {
				return []string{fmt.Sprintf("http task body must be valid JSON or a string: %s", taskID)}
			}
		}
	}

	if raw, ok := config["credential"]; ok && len(raw) > 0 {
		if strings.TrimSpace(jsonString(raw)) == "" {
			return []string{fmt.Sprintf("http task credential must be a non-empty string: %s", taskID)}
		}
	}

	if raw, ok := config["auth"]; ok {
		auth := strings.ToLower(jsonString(raw))
		switch auth {
		case "bearer", "basic", "header":
		default:
			return []string{fmt.Sprintf("http task has unsupported auth type: %s", taskID)}
		}
	}

	if raw, ok := config["credential_header"]; ok && len(raw) > 0 {
		if strings.TrimSpace(jsonString(raw)) == "" {
			return []string{fmt.Sprintf("http task credential_header must be a non-empty string: %s", taskID)}
		}
	}

	return nil
}

func validateEmailConfig(taskID string, config map[string]json.RawMessage) []string {
	toRaw, ok := config["to"]
	if !ok || strings.TrimSpace(jsonString(toRaw)) == "" {
		return []string{fmt.Sprintf("email task requires to: %s", taskID)}
	}
	to := splitAddresses(jsonString(toRaw))
	if len(to) == 0 {
		return []string{fmt.Sprintf("email task requires to: %s", taskID)}
	}
	for _, address := range to {
		if !strings.Contains(address, "@") || strings.HasPrefix(address, "@") || strings.HasSuffix(address, "@") {
			return []string{fmt.Sprintf("email task has invalid recipient: %s", taskID)}
		}
	}
	if raw, ok := config["subject"]; !ok || strings.TrimSpace(jsonString(raw)) == "" {
		return []string{fmt.Sprintf("email task requires subject: %s", taskID)}
	}
	if raw, ok := config["from"]; ok && len(raw) > 0 {
		from := jsonString(raw)
		if strings.TrimSpace(from) != "" && (!strings.Contains(from, "@") || strings.HasPrefix(from, "@") || strings.HasSuffix(from, "@")) {
			return []string{fmt.Sprintf("email task has invalid from address: %s", taskID)}
		}
	}
	return nil
}

func jsonString(raw json.RawMessage) string {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return ""
	}
	return value
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
