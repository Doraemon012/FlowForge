package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/project"
)

type projectRequest struct {
	Name string `json:"name"`
}

func (s *Server) CreateProject(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	var request projectRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	if request.Name == "" || len(request.Name) > 100 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "project name is required and must be at most 100 characters")
		return
	}
	now := time.Now().UTC()
	created := project.Project{ID: uuid.New(), OwnerID: ownerID, Name: request.Name, Status: "active", CreatedAt: now, UpdatedAt: now}
	if err := s.projects.Create(r.Context(), created); err != nil {
		writeError(w, http.StatusConflict, "project_name_unavailable", "project could not be created")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) ListProjects(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	projects, err := s.projects.ListOwned(r.Context(), ownerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "project_lookup_failed", "unable to list projects")
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (s *Server) GetProject(w http.ResponseWriter, r *http.Request) {
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
	result, err := s.projects.GetOwned(r.Context(), ownerID, projectID)
	if errors.Is(err, project.ErrNotFound) {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "project_lookup_failed", "unable to retrieve project")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) UpdateProject(w http.ResponseWriter, r *http.Request) {
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
	var request projectRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	if request.Name == "" || len(request.Name) > 100 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "project name is required and must be at most 100 characters")
		return
	}
	result, err := s.projects.UpdateOwned(r.Context(), ownerID, projectID, request.Name, time.Now().UTC())
	if errors.Is(err, project.ErrNotFound) {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusConflict, "project_update_failed", "project could not be updated")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) DeleteProject(w http.ResponseWriter, r *http.Request) {
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
	if err := s.projects.ArchiveOwned(r.Context(), ownerID, projectID, time.Now().UTC()); errors.Is(err, project.ErrNotFound) {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "project_delete_failed", "project could not be archived")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
