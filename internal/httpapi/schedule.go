package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/schedule"
	"github.com/neyati/flowforge/internal/workflow"
)

type createScheduleRequest struct {
	CronExpression string `json:"cron_expression"`
	Timezone       string `json:"timezone"`
}

type scheduleResponse struct {
	ID              uuid.UUID  `json:"id"`
	ProjectID       uuid.UUID  `json:"project_id"`
	WorkflowID      uuid.UUID  `json:"workflow_id"`
	CronExpression  string     `json:"cron_expression"`
	Timezone        string     `json:"timezone"`
	Enabled         bool       `json:"enabled"`
	NextOccurrence  *time.Time `json:"next_occurrence"`
	LastTriggeredAt *time.Time `json:"last_triggered_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

func (s *Server) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.schedules == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "schedules not configured")
		return
	}

	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}

	// Verify workflow ownership
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) || item.ProjectID != projectID {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}

	var req createScheduleRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.CronExpression == "" {
		writeError(w, http.StatusBadRequest, "invalid_cron", "cron expression is required")
		return
	}
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}

	now := time.Now().UTC()
	sched := schedule.Schedule{
		ID:             uuid.New(),
		ProjectID:      projectID,
		WorkflowID:     workflowID,
		CronExpression: req.CronExpression,
		Timezone:       req.Timezone,
		Enabled:        true,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := s.schedules.Create(r.Context(), sched); err != nil {
		if errors.Is(err, schedule.ErrConflict) {
			writeError(w, http.StatusConflict, "schedule_exists", "a schedule already exists for this workflow")
			return
		}
		writeError(w, http.StatusInternalServerError, "schedule_create_failed", "unable to create schedule")
		return
	}

	writeJSON(w, http.StatusCreated, scheduleResponse{
		ID:             sched.ID,
		ProjectID:      sched.ProjectID,
		WorkflowID:     sched.WorkflowID,
		CronExpression: sched.CronExpression,
		Timezone:       sched.Timezone,
		Enabled:        sched.Enabled,
		CreatedAt:      sched.CreatedAt,
		UpdatedAt:      sched.UpdatedAt,
	})
}

func (s *Server) GetSchedule(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.schedules == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "schedules not configured")
		return
	}

	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}

	// Verify workflow ownership
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) || item.ProjectID != projectID {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}

	sched, err := s.schedules.GetByWorkflow(r.Context(), projectID, workflowID)
	if errors.Is(err, schedule.ErrNotFound) {
		writeError(w, http.StatusNotFound, "schedule_not_found", "schedule not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "schedule_lookup_failed", "unable to retrieve schedule")
		return
	}

	writeJSON(w, http.StatusOK, scheduleResponse{
		ID:              sched.ID,
		ProjectID:       sched.ProjectID,
		WorkflowID:      sched.WorkflowID,
		CronExpression:  sched.CronExpression,
		Timezone:        sched.Timezone,
		Enabled:         sched.Enabled,
		NextOccurrence:  sched.NextOccurrence,
		LastTriggeredAt: sched.LastTriggeredAt,
		CreatedAt:       sched.CreatedAt,
		UpdatedAt:       sched.UpdatedAt,
	})
}

type updateScheduleRequest struct {
	CronExpression string `json:"cron_expression"`
	Timezone       string `json:"timezone"`
	Enabled        bool   `json:"enabled"`
}

func (s *Server) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.schedules == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "schedules not configured")
		return
	}

	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}

	// Verify workflow ownership
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) || item.ProjectID != projectID {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}

	// Get existing schedule
	existing, err := s.schedules.GetByWorkflow(r.Context(), projectID, workflowID)
	if errors.Is(err, schedule.ErrNotFound) {
		writeError(w, http.StatusNotFound, "schedule_not_found", "schedule not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "schedule_lookup_failed", "unable to retrieve schedule")
		return
	}

	var req updateScheduleRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.CronExpression == "" {
		writeError(w, http.StatusBadRequest, "invalid_cron", "cron expression is required")
		return
	}
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}

	updated, err := s.schedules.UpdateOwned(r.Context(), ownerID, projectID, existing.ID, req.CronExpression, req.Timezone, req.Enabled, time.Now().UTC())
	if errors.Is(err, schedule.ErrNotFound) {
		writeError(w, http.StatusNotFound, "schedule_not_found", "schedule not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "schedule_update_failed", "unable to update schedule")
		return
	}

	writeJSON(w, http.StatusOK, scheduleResponse{
		ID:              updated.ID,
		ProjectID:       updated.ProjectID,
		WorkflowID:      updated.WorkflowID,
		CronExpression:  updated.CronExpression,
		Timezone:        updated.Timezone,
		Enabled:         updated.Enabled,
		NextOccurrence:  updated.NextOccurrence,
		LastTriggeredAt: updated.LastTriggeredAt,
		CreatedAt:       updated.CreatedAt,
		UpdatedAt:       updated.UpdatedAt,
	})
}

func (s *Server) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.schedules == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "schedules not configured")
		return
	}

	projectID, workflowID, valid := workflowIDs(r)
	if !valid {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}

	// Verify workflow ownership
	item, err := s.workflows.GetOwned(r.Context(), ownerID, workflowID)
	if errors.Is(err, workflow.ErrNotFound) || item.ProjectID != projectID {
		writeError(w, http.StatusNotFound, "workflow_not_found", "workflow not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}

	// Get existing schedule
	existing, err := s.schedules.GetByWorkflow(r.Context(), projectID, workflowID)
	if errors.Is(err, schedule.ErrNotFound) {
		writeError(w, http.StatusNotFound, "schedule_not_found", "schedule not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "schedule_lookup_failed", "unable to retrieve schedule")
		return
	}

	if err := s.schedules.DeleteOwned(r.Context(), ownerID, projectID, existing.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "schedule_delete_failed", "unable to delete schedule")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
