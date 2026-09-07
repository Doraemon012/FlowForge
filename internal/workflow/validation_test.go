package workflow

import (
	"encoding/json"
	"reflect"
	"testing"
)

func task(id, taskType string, dependencies ...string) Task {
	return Task{ID: id, Type: taskType, Config: json.RawMessage(`{}`), Dependencies: dependencies}
}

func taskWithConfig(id, taskType, config string, dependencies ...string) Task {
	return Task{ID: id, Type: taskType, Config: json.RawMessage(config), Dependencies: dependencies}
}

func TestValidateDefinitionAcceptsLinearBranchingAndConvergingGraphs(t *testing.T) {
	tests := []struct {
		name       string
		definition Definition
	}{
		{
			name: "linear",
			definition: Definition{Tasks: []Task{
				taskWithConfig("a", "transform", `{}`),
				taskWithConfig("b", "delay", `{"seconds":1}`, "a"),
				taskWithConfig("c", "http", `{"url":"https://example.com"}`, "b"),
			}},
		},
		{
			name: "branching",
			definition: Definition{Tasks: []Task{
				taskWithConfig("a", "transform", `{}`),
				taskWithConfig("b", "delay", `{"seconds":1}`, "a"),
				taskWithConfig("c", "http", `{"url":"https://example.com"}`, "a"),
			}},
		},
		{
			name: "converging",
			definition: Definition{Tasks: []Task{
				taskWithConfig("a", "transform", `{}`),
				taskWithConfig("b", "delay", `{"seconds":1}`, "a"),
				taskWithConfig("c", "http", `{"url":"https://example.com"}`, "a"),
				taskWithConfig("d", "email", `{"to":"you@example.com","subject":"done"}`, "b", "c"),
			}},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if errorsFound := ValidateDefinition(test.definition); len(errorsFound) != 0 {
				t.Fatalf("ValidateDefinition() errors = %v", errorsFound)
			}
		})
	}
}

func TestValidateDefinitionRejectsCyclesAndInvalidStructure(t *testing.T) {
	definition := Definition{Tasks: []Task{
		{ID: "a", Type: "transform", Config: json.RawMessage(`{}`), Dependencies: []string{"c"}},
		{ID: "a", Type: "unknown", Config: json.RawMessage(`[]`), Dependencies: []string{"missing"}},
		{ID: "c", Type: "transform", Config: json.RawMessage(`{}`), Dependencies: []string{"a"}},
	}}
	want := []string{
		"dependency cycle detected at task: a",
		"duplicate task id: a",
		"task config must be a JSON object: a",
		"unknown dependency for a: missing",
		"unsupported task type for a: unknown",
	}
	if got := ValidateDefinition(definition); !reflect.DeepEqual(got, want) {
		t.Fatalf("ValidateDefinition() = %v, want %v", got, want)
	}
}

func TestValidateDefinitionRejectsEmptyAndSelfDependency(t *testing.T) {
	if got := ValidateDefinition(Definition{}); !reflect.DeepEqual(got, []string{"tasks must contain at least one task"}) {
		t.Fatalf("empty definition errors = %v", got)
	}
	got := ValidateDefinition(Definition{Tasks: []Task{task("a", "transform", "a")}})
	if len(got) != 2 || got[0] != "dependency cycle detected at task: a" || got[1] != "task cannot depend on itself: a" {
		t.Fatalf("self dependency errors = %v", got)
	}
}
