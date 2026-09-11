package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/neyati/flowforge/internal/ai"
	"github.com/neyati/flowforge/internal/trial"
	"github.com/neyati/flowforge/internal/workflow"
)

// isAIValidationError reports whether err is the server-side validator
// rejecting the model's output, as opposed to the provider failing to answer at
// all. The distinction decides whether a trial AI use is charged: a provider
// outage is refunded, a model that answered with an unusable definition is not.
func isAIValidationError(err error) bool {
	var validationErr *ai.ValidationError
	return errors.As(err, &validationErr)
}

type generateWorkflowRequest struct {
	Prompt string `json:"prompt"`
}

type generateWorkflowResponse struct {
	Definition workflow.Definition `json:"definition"`
	// Warnings are advisory review notes for the generated definition (for
	// example placeholder values or non-idempotent retries). They never block
	// use; they tell the caller what still needs a human look before running.
	Warnings []workflow.ReviewWarning `json:"warnings"`
}

type editWorkflowRequest struct {
	Instruction string               `json:"instruction"`
	Definition  *workflow.Definition `json:"definition"`
}

type aiStatusResponse struct {
	Enabled bool `json:"enabled"`
}

// AIStatus lets the client find out whether AI generation is available so the
// UI can enable or disable the feature honestly rather than optimistically.
func (s *Server) AIStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := authenticatedUserID(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	writeJSON(w, http.StatusOK, aiStatusResponse{Enabled: s.ai != nil && s.ai.Enabled()})
}

// GenerateWorkflow turns a natural-language description into a validated
// workflow definition. It is a real generation feature: when no AI provider is
// configured it reports that plainly (503) instead of returning a placeholder.
func (s *Server) GenerateWorkflow(w http.ResponseWriter, r *http.Request) {
	if s.ai == nil || !s.ai.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "AI workflow generation is not configured")
		return
	}
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	// Require a workflow the caller owns. Generation is stateless, but this
	// keeps the endpoint scoped to a real resource rather than being an open
	// text-to-JSON proxy.
	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) || !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}

	var request generateWorkflowRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Prompt = strings.TrimSpace(request.Prompt)
	if request.Prompt == "" {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "a description of the workflow is required")
		return
	}
	if len(request.Prompt) > 4000 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "the description must be at most 4000 characters")
		return
	}

	refund, ok := s.beginTrialAIUse(w, r, ownerID, trial.KindGeneration)
	if !ok {
		return
	}

	definition, err := s.ai.Generate(r.Context(), request.Prompt)
	if err != nil {
		// A provider outage or misconfiguration is not the visitor's fault, so
		// the use is given back. A model that answered with an invalid
		// definition did do work, so that use stands.
		if !isAIValidationError(err) {
			refund()
		}
		var validationErr *ai.ValidationError
		switch {
		case errors.Is(err, ai.ErrNotConfigured):
			writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "AI workflow generation is not configured")
		case errors.As(err, &validationErr):
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"code":    "ai_invalid_workflow",
				"message": "the generated workflow did not pass validation",
				"errors":  validationErr.Errors,
			})
		default:
			writeError(w, http.StatusBadGateway, "ai_generation_failed", "the AI provider could not generate a workflow")
		}
		return
	}
	writeJSON(w, http.StatusOK, generateWorkflowResponse{
		Definition: definition,
		Warnings:   workflow.ReviewDefinition(definition),
	})
}

// requireOwnedWorkflow resolves the project/workflow pair from the route and
// verifies that the authenticated caller owns it. It writes the appropriate
// error response and returns ok=false when either check fails.
func (s *Server) requireOwnedWorkflow(w http.ResponseWriter, r *http.Request) (workflow.Workflow, bool) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return workflow.Workflow{}, false
	}
	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return workflow.Workflow{}, false
	}
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) || !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return workflow.Workflow{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return workflow.Workflow{}, false
	}
	return item, true
}

// writeAIError maps an ai-package error onto the HTTP response the client
// expects: 503 when the feature is unconfigured, 422 with the validator's
// messages when the model could not produce a valid definition, and 502 for any
// upstream/provider failure.
func (s *Server) writeAIError(w http.ResponseWriter, err error, upstreamMessage string) {
	var validationErr *ai.ValidationError
	switch {
	case errors.Is(err, ai.ErrNotConfigured):
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "AI features are not configured")
	case errors.As(err, &validationErr):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"code":    "ai_invalid_workflow",
			"message": "the AI result did not pass validation",
			"errors":  validationErr.Errors,
		})
	default:
		writeError(w, http.StatusBadGateway, "ai_failed", upstreamMessage)
	}
}

// EditWorkflow revises an existing workflow definition from a natural-language
// instruction. It is the in-place counterpart to GenerateWorkflow: the client
// sends the definition currently in the builder (so unsaved edits can be
// refined), or omits it to edit the stored draft. The reply is validated
// server-side before it is returned, exactly like generation.
func (s *Server) EditWorkflow(w http.ResponseWriter, r *http.Request) {
	if s.ai == nil || !s.ai.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "AI workflow editing is not configured")
		return
	}
	item, ok := s.requireOwnedWorkflow(w, r)
	if !ok {
		return
	}

	var request editWorkflowRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Instruction = strings.TrimSpace(request.Instruction)
	if request.Instruction == "" {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "an instruction describing the change is required")
		return
	}
	if len(request.Instruction) > 2000 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "the instruction must be at most 2000 characters")
		return
	}

	current := item.DraftDefinition
	if request.Definition != nil {
		current = *request.Definition
	}
	if len(current.Tasks) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "there is nothing to edit yet; add tasks first")
		return
	}

	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	refund, ok := s.beginTrialAIUse(w, r, ownerID, trial.KindEdit)
	if !ok {
		return
	}

	definition, err := s.ai.Edit(r.Context(), current, request.Instruction)
	if err != nil {
		// See GenerateWorkflow: refund only when the provider itself failed.
		if !isAIValidationError(err) {
			refund()
		}
		s.writeAIError(w, err, "the AI provider could not edit the workflow")
		return
	}
	writeJSON(w, http.StatusOK, generateWorkflowResponse{
		Definition: definition,
		Warnings:   workflow.ReviewDefinition(definition),
	})
}
