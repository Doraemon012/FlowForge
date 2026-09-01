package workflow

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/neyati/flowforge/internal/artifact"
)

func TestValidateDefinitionRejectsOversizedTaskConfig(t *testing.T) {
	big := strings.Repeat("x", artifact.MaxTaskConfigBytes+1)
	definition := Definition{Tasks: []Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{"data":"` + big + `"}`)}}}
	errs := ValidateDefinition(definition)
	found := false
	for _, err := range errs {
		if err == "task config exceeds maximum size: a" {
			found = true
		}
	}
	if !found {
		t.Fatalf("errors = %v", errs)
	}
}

func TestValidateDefinitionRejectsOversizedDefinition(t *testing.T) {
	var tasks []Task
	for i := 0; i < 150; i++ {
		big := strings.Repeat("x", 2048)
		tasks = append(tasks, Task{ID: fmt.Sprintf("task-%d", i), Type: "transform", Config: json.RawMessage(`{"data":"` + big + `"}`)})
	}
	definition := Definition{Tasks: tasks}
	errs := ValidateDefinition(definition)
	found := false
	for _, err := range errs {
		if err == "workflow definition exceeds maximum size" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected definition size error, got %v", errs)
	}
}
