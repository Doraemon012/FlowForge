package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/workflow"
)

type executionRequest struct {
	VersionID uuid.UUID       `json:"version_id"`
	Input     json.RawMessage `json:"input"`
}

func (s *Server) CreateExecution(w http.ResponseWriter, r *http.Request) {
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
	if errors.Is(err, workflow.ErrNotFound) || item.ProjectID != projectID {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}
	var request executionRequest
	if r.ContentLength != 0 {
		if !decodeJSON(w, r, &request) {
			return
		}
	}
	if request.VersionID == uuid.Nil {
		if item.ActiveVersionID != nil {
			request.VersionID = *item.ActiveVersionID
		}
	}
	if request.VersionID == uuid.Nil {
		writeError(w, http.StatusConflict, "workflow_not_active", "workflow has no active published version")
		return
	}
	if len(request.Input) == 0 {
		request.Input = json.RawMessage(`{}`)
	}

	// Manual/API trigger hardening: an Idempotency-Key header lets a client
	// safely retry a trigger without creating a duplicate execution.
	if idempotencyKey := r.Header.Get("Idempotency-Key"); idempotencyKey != "" {
		if s.idempotency == nil {
			writeError(w, http.StatusNotImplemented, "not_implemented", "idempotency not configured")
			return
		}
		existingExecutionID, idemErr := s.idempotency.GetExecutionByIdempotencyKey(r.Context(), projectID, idempotencyKey)
		switch {
		case idemErr == nil:
			existing, getErr := s.executions.GetOwned(r.Context(), ownerID, existingExecutionID)
			if getErr != nil {
				writeError(w, http.StatusInternalServerError, "execution_lookup_failed", "unable to retrieve prior execution")
				return
			}
			writeJSON(w, http.StatusOK, existing)
			return
		case !errors.Is(idemErr, execution.ErrIdempotencyNotFound):
			writeError(w, http.StatusInternalServerError, "idempotency_check_failed", "unable to check idempotency")
			return
		}
	}

	created, err := s.executions.CreateOwned(r.Context(), ownerID, workflowID, request.VersionID, request.Input, time.Now().UTC())
	if errors.Is(err, execution.ErrVersionInvalid) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_version", "workflow version is not executable")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "execution_create_failed", "execution could not be created")
		return
	}

	if idempotencyKey := r.Header.Get("Idempotency-Key"); idempotencyKey != "" {
		if err := s.idempotency.RecordIdempotencyKey(r.Context(), projectID, created.ID, idempotencyKey, time.Now().UTC()); err != nil {
			s.logger.Error("record execution idempotency", "execution_id", created.ID, "error", err)
		}
	}

	s.engine.Start(context.Background(), ownerID, created.ID)
	writeJSON(w, http.StatusAccepted, created)
}

func (s *Server) GetExecution(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "executionID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	item, err := s.executions.GetOwned(r.Context(), ownerID, id)
	if errors.Is(err, execution.ErrNotFound) {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "execution_lookup_failed", "unable to retrieve execution")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) ListExecutions(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "projectID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	}
	if _, err := s.projects.GetOwned(r.Context(), ownerID, id); errors.Is(err, project.ErrNotFound) {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "project_lookup_failed", "unable to retrieve project")
		return
	}
	items, err := s.executions.ListOwned(r.Context(), ownerID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "execution_lookup_failed", "unable to list executions")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) ListTaskRuns(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "executionID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	items, err := s.executions.ListTaskRunsOwned(r.Context(), ownerID, id)
	if errors.Is(err, execution.ErrNotFound) {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "execution_lookup_failed", "unable to list task runs")
		return
	}
	writeJSON(w, http.StatusOK, items)
}
