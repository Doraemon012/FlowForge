package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/execution"
)

// ListExecutionEvents returns the append-only lifecycle event history for an
// owned execution.
func (s *Server) ListExecutionEvents(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.observ == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "observability not configured")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "executionID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	if err := s.requireOwnedExecution(r, ownerID, id); err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	events, err := s.observ.ListEvents(r.Context(), ownerID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "event_lookup_failed", "unable to retrieve execution events")
		return
	}
	writeJSON(w, http.StatusOK, events)
}

// ListExecutionLogs returns the persisted structured log history for an owned
// execution, redacted by the recorder before storage.
func (s *Server) ListExecutionLogs(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.observ == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "observability not configured")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "executionID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	if err := s.requireOwnedExecution(r, ownerID, id); err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	entries, err := s.observ.ListLogs(r.Context(), ownerID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "log_lookup_failed", "unable to retrieve execution logs")
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

// MetricsView returns an aggregate operational health view.
func (s *Server) MetricsView(w http.ResponseWriter, r *http.Request) {
	_, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.observ == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "observability not configured")
		return
	}
	metrics, err := s.observ.Metrics(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "metrics_lookup_failed", "unable to retrieve metrics")
		return
	}
	writeJSON(w, http.StatusOK, metrics)
}

// ListExecutionAttempts returns the append-only attempt history for an owned
// execution, including worker assignments and failure classification.
func (s *Server) ListExecutionAttempts(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.observ == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "observability not configured")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "executionID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	if err := s.requireOwnedExecution(r, ownerID, id); err != nil {
		writeError(w, http.StatusNotFound, "execution_not_found", "execution not found")
		return
	}
	attempts, err := s.observ.ListAttempts(r.Context(), ownerID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "attempt_lookup_failed", "unable to retrieve execution attempts")
		return
	}
	writeJSON(w, http.StatusOK, attempts)
}

// ListWorkers returns an operator view of active worker activity.
func (s *Server) ListWorkers(w http.ResponseWriter, r *http.Request) {
	_, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.observ == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "observability not configured")
		return
	}
	views, err := s.observ.ListWorkers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "worker_lookup_failed", "unable to retrieve workers")
		return
	}
	writeJSON(w, http.StatusOK, views)
}

// QueueMetrics returns a durable queue health view (depth, claims, leases).
func (s *Server) QueueMetrics(w http.ResponseWriter, r *http.Request) {
	_, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.observ == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "observability not configured")
		return
	}
	view, err := s.observ.QueueView(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "queue_lookup_failed", "unable to retrieve queue metrics")
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// requireOwnedExecution verifies the authenticated caller owns the referenced
// execution. Unauthorized or unknown executions are intentionally reported as
// 404 to avoid disclosing resource existence.
func (s *Server) requireOwnedExecution(r *http.Request, ownerID, executionID uuid.UUID) error {
	if s.executions == nil {
		return execution.ErrNotFound
	}
	_, err := s.executions.GetOwned(r.Context(), ownerID, executionID)
	if errors.Is(err, execution.ErrNotFound) {
		return execution.ErrNotFound
	}
	return err
}
