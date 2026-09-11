package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/neyati/flowforge/internal/workflow"
)

// ErrNotConfigured is returned when the selected AI provider has no credentials.
// The HTTP layer maps it to 503 so the client can disable the feature rather
// than receiving a fabricated result.
var ErrNotConfigured = errors.New("ai features are not configured")

// ValidationError reports that the model produced a definition that still
// failed server-side validation after one repair attempt. It carries the
// validator's messages so the caller can surface exactly why.
type ValidationError struct {
	Errors []string
}

func (e *ValidationError) Error() string {
	return "generated workflow is invalid: " + strings.Join(e.Errors, "; ")
}

// How many times the model may be asked to repair an invalid answer.
const maxRepairAttempts = 1

// Generator turns a natural-language description into a validated FlowForge
// workflow definition. It is provider-agnostic: every vendor specific lives
// behind the Provider interface, and it never returns an unvalidated definition.
type Generator struct {
	provider Provider
	selected string
}

// NewGenerator builds a generator for the provider selected by config. When the
// selected provider has no API key the generator is disabled, so the rest of the
// system can be constructed without AI configured.
func NewGenerator(config Config) *Generator {
	return &Generator{provider: newProvider(config), selected: config.SelectedProvider()}
}

// Enabled reports whether the selected provider has credentials to call.
func (g *Generator) Enabled() bool {
	return g != nil && g.provider != nil
}

// ProviderName reports the provider the operator selected, whether or not it is
// configured, so the UI can explain exactly which credentials are missing.
func (g *Generator) ProviderName() string {
	if g == nil {
		return ""
	}
	return g.selected
}

// Generate asks the configured provider for a workflow matching prompt, then
// validates the result. On an invalid answer it returns the definition only
// after a repair attempt; the final answer is always checked by
// workflow.ValidateDefinition.
func (g *Generator) Generate(ctx context.Context, prompt string) (workflow.Definition, error) {
	if !g.Enabled() {
		return workflow.Definition{}, ErrNotConfigured
	}
	return g.completeValidated(ctx, []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	})
}

// Edit revises an existing definition according to a natural-language
// instruction. It is the in-place counterpart to Generate: the current
// definition is given to the model as context and the reply is validated the
// same way, so an edit can never return an invalid workflow.
func (g *Generator) Edit(ctx context.Context, current workflow.Definition, instruction string) (workflow.Definition, error) {
	if !g.Enabled() {
		return workflow.Definition{}, ErrNotConfigured
	}
	encoded, err := json.Marshal(current)
	if err != nil {
		return workflow.Definition{}, fmt.Errorf("current definition could not be serialized: %w", err)
	}
	return g.completeValidated(ctx, []Message{
		{Role: "system", Content: editSystemPrompt},
		{Role: "user", Content: "Current workflow definition:\n" + string(encoded) + "\n\nRequested change:\n" + instruction},
	})
}

// completeValidated runs the model and only returns a definition that passes
// workflow.ValidateDefinition, allowing one repair attempt first.
func (g *Generator) completeValidated(ctx context.Context, messages []Message) (workflow.Definition, error) {
	var lastErrors []string
	for attempt := 0; attempt <= maxRepairAttempts; attempt++ {
		content, err := g.provider.Complete(ctx, messages)
		if err != nil {
			return workflow.Definition{}, err
		}
		definition, parseErr := parseDefinition(content)
		if parseErr == nil {
			validationErrors := workflow.ValidateDefinition(definition)
			if len(validationErrors) == 0 {
				return definition, nil
			}
			lastErrors = validationErrors
		} else {
			lastErrors = []string{parseErr.Error()}
		}
		messages = append(messages,
			Message{Role: "assistant", Content: content},
			Message{Role: "user", Content: repairInstruction(lastErrors)},
		)
	}
	return workflow.Definition{}, &ValidationError{Errors: lastErrors}
}

// parseDefinition extracts a JSON object from the model's reply. Models
// frequently wrap JSON in markdown fences or add prose, so the widest
// brace-delimited span is used.
func parseDefinition(content string) (workflow.Definition, error) {
	trimmed := strings.TrimSpace(content)
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start == -1 || end == -1 || end < start {
		return workflow.Definition{}, errors.New("the model did not return a JSON object")
	}
	var definition workflow.Definition
	if err := json.Unmarshal([]byte(trimmed[start:end+1]), &definition); err != nil {
		return workflow.Definition{}, errors.New("the model returned JSON that is not a workflow definition")
	}
	return definition, nil
}
