package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/workflow"
)

const maxWorkflowRequestBytes = 1 << 20

type workflowRequest struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Definition  workflow.Definition `json:"definition"`
}

// validateWorkflowRequest lets a client validate a definition it has not saved
// yet. When Definition is omitted the stored draft is validated instead.
type validateWorkflowRequest struct {
	Definition *workflow.Definition `json:"definition"`
}

func workflowIDs(r *http.Request) (uuid.UUID, uuid.UUID, bool) {
	projectID, projectErr := uuid.Parse(chi.URLParam(r, "projectID"))
	workflowID, workflowErr := uuid.Parse(chi.URLParam(r, "workflowID"))
	return projectID, workflowID, projectErr == nil && workflowErr == nil
}

func workflowProjectMatches(item workflow.Workflow, projectID uuid.UUID) bool {
	return item.ProjectID == projectID
}

func writeWorkflowValidationError(w http.ResponseWriter, validationErrors []string, warnings []workflow.ReviewWarning) {
	writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"code": "invalid_workflow", "message": "workflow definition is invalid", "errors": validationErrors, "warnings": warnings})
}

func (s *Server) CreateWorkflow(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	var request workflowRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	if request.Name == "" || len(request.Name) > 200 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "workflow name is required and must be at most 200 characters")
		return
	}
	now := time.Now().UTC()
	projectID, err := uuid.Parse(chi.URLParam(r, "projectID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	}
	item := workflow.Workflow{ID: uuid.New(), ProjectID: projectID, Name: request.Name, Description: strings.TrimSpace(request.Description), Status: "draft", DraftDefinition: request.Definition, CreatedAt: now, UpdatedAt: now}
	if err := s.workflows.Create(r.Context(), ownerID, item.ProjectID, item); errors.Is(err, workflow.ErrProjectNotFound) {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
	} else if err != nil {
		writeError(w, http.StatusConflict, "workflow_create_failed", "workflow could not be created")
	} else {
		writeJSON(w, http.StatusCreated, item)
	}
}

func (s *Server) ListWorkflows(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, err := uuid.Parse(chi.URLParam(r, "projectID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	}
	if _, err := s.projects.GetOwned(r.Context(), ownerID, projectID); errors.Is(err, project.ErrNotFound) {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "project_lookup_failed", "unable to retrieve project")
		return
	}
	items, err := s.workflows.ListByProject(r.Context(), ownerID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to list workflows")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) GetWorkflow(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) UpdateWorkflow(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	var request workflowRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	if request.Name == "" || len(request.Name) > 200 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "workflow name is required and must be at most 200 characters")
		return
	}
	item, err := s.workflows.UpdateOwned(r.Context(), ownerID, workflowID, request.Name, strings.TrimSpace(request.Description), request.Definition, time.Now().UTC())
	if errors.Is(err, workflow.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusConflict, "workflow_update_failed", "workflow could not be updated")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) ValidateWorkflow(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}
	// Validate the stored draft by default. When a client sends a definition in
	// the body, validate that instead so unsaved builder changes can be checked
	// without persisting them.
	definition := item.DraftDefinition
	body, readErr := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWorkflowRequestBytes))
	if readErr != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "invalid request body")
		return
	}
	if len(bytes.TrimSpace(body)) > 0 {
		var request validateWorkflowRequest
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid_request", "invalid request body")
			return
		}
		if request.Definition != nil {
			definition = *request.Definition
		}
	}
	validationErrors := workflow.ValidateDefinition(definition)
	warnings := workflow.ReviewDefinition(definition)
	if len(validationErrors) > 0 {
		writeWorkflowValidationError(w, validationErrors, warnings)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"valid": true, "errors": []string{}, "warnings": warnings})
}

func (s *Server) PublishWorkflow(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}
	if validationErrors := workflow.ValidateDefinition(item.DraftDefinition); len(validationErrors) > 0 {
		writeWorkflowValidationError(w, validationErrors, workflow.ReviewDefinition(item.DraftDefinition))
		return
	}
	version, err := s.workflows.PublishOwned(r.Context(), ownerID, workflowID, item.DraftDefinition, time.Now().UTC())
	if errors.Is(err, workflow.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusConflict, "workflow_publish_failed", "workflow could not be published")
		return
	}
	writeJSON(w, http.StatusCreated, version)
}

func (s *Server) ListVersions(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
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
	versions, err := s.workflows.ListVersionsOwned(r.Context(), ownerID, workflowID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "version_lookup_failed", "unable to list workflow versions")
		return
	}
	writeJSON(w, http.StatusOK, versions)
}

func (s *Server) GetVersion(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, workflowID, valid := workflowIDs(r)
	versionID, versionErr := uuid.Parse(chi.URLParam(r, "versionID"))
	if !valid || versionErr != nil {
		writeError(w, http.StatusNotFound, "version_not_found", "workflow version not found")
		return
	}
	version, err := s.workflows.GetVersionOwned(r.Context(), ownerID, workflowID, versionID)
	if errors.Is(err, workflow.ErrVersionNotFound) {
		writeError(w, http.StatusNotFound, "version_not_found", "workflow version not found")
		return
	}
	item, workflowErr := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(workflowErr, workflow.ErrNotFound) || !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "version_not_found", "workflow version not found")
		return
	}
	if workflowErr != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "version_lookup_failed", "unable to retrieve workflow version")
		return
	}
	writeJSON(w, http.StatusOK, version)
}

func (s *Server) ActivateVersion(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, workflowID, valid := workflowIDs(r)
	versionID, versionErr := uuid.Parse(chi.URLParam(r, "versionID"))
	if !valid || versionErr != nil {
		writeError(w, http.StatusNotFound, "version_not_found", "workflow version not found")
		return
	}
	item, workflowErr := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(workflowErr, workflow.ErrNotFound) || !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "version_not_found", "workflow version not found")
		return
	}
	if workflowErr != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}
	if err := s.workflows.ActivateVersionOwned(r.Context(), ownerID, workflowID, versionID, time.Now().UTC()); errors.Is(err, workflow.ErrVersionNotFound) {
		writeError(w, http.StatusNotFound, "version_not_found", "workflow version not found")
	} else if err != nil {
		writeError(w, http.StatusConflict, "version_activation_failed", "workflow version could not be activated")
	} else {
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) DeactivateWorkflow(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	item, workflowErr := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(workflowErr, workflow.ErrNotFound) || !workflowProjectMatches(item, projectID) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if workflowErr != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}
	if err := s.workflows.DeactivateOwned(r.Context(), ownerID, workflowID, time.Now().UTC()); errors.Is(err, workflow.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
	} else if err != nil {
		writeError(w, http.StatusConflict, "workflow_deactivation_failed", "workflow could not be deactivated")
	} else {
		w.WriteHeader(http.StatusNoContent)
	}
}
