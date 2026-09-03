package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) Router() http.Handler {
	router := chi.NewRouter()
	router.Get("/health", s.Health)
	if s.users == nil || s.projects == nil || s.workflows == nil || s.tokens == nil {
		return router
	}
	router.Route("/api/v1", func(router chi.Router) {
		router.Post("/auth/register", s.Register)
		router.Post("/auth/login", s.Login)
		// Public webhook endpoint (no auth required)
		router.Post("/webhooks/{webhookID}", s.HandleWebhook)
		router.Group(func(router chi.Router) {
			router.Use(s.RequireAuth)
			router.Post("/projects", s.CreateProject)
			router.Get("/projects", s.ListProjects)
			router.Get("/projects/{projectID}", s.GetProject)
			router.Patch("/projects/{projectID}", s.UpdateProject)
			router.Delete("/projects/{projectID}", s.DeleteProject)
			router.Post("/projects/{projectID}/workflows", s.CreateWorkflow)
			router.Get("/projects/{projectID}/workflows", s.ListWorkflows)
			router.Get("/projects/{projectID}/workflows/{workflowID}", s.GetWorkflow)
			router.Patch("/projects/{projectID}/workflows/{workflowID}", s.UpdateWorkflow)
			router.Post("/projects/{projectID}/workflows/{workflowID}/validate", s.ValidateWorkflow)
			router.Post("/projects/{projectID}/workflows/{workflowID}/versions", s.PublishWorkflow)
			router.Get("/projects/{projectID}/workflows/{workflowID}/versions", s.ListVersions)
			router.Get("/projects/{projectID}/workflows/{workflowID}/versions/{versionID}", s.GetVersion)
			router.Post("/projects/{projectID}/workflows/{workflowID}/versions/{versionID}/activate", s.ActivateVersion)
			router.Post("/projects/{projectID}/workflows/{workflowID}/versions/{versionID}/deactivate", s.DeactivateWorkflow)
			if s.executions != nil && s.engine != nil {
				router.Post("/projects/{projectID}/workflows/{workflowID}/executions", s.CreateExecution)
				router.Get("/projects/{projectID}/executions", s.ListExecutions)
				router.Get("/executions/{executionID}", s.GetExecution)
				router.Get("/executions/{executionID}/tasks", s.ListTaskRuns)
			}
			if s.schedules != nil {
				router.Post("/projects/{projectID}/workflows/{workflowID}/schedules", s.CreateSchedule)
				router.Get("/projects/{projectID}/workflows/{workflowID}/schedules", s.GetSchedule)
				router.Patch("/projects/{projectID}/workflows/{workflowID}/schedules", s.UpdateSchedule)
				router.Delete("/projects/{projectID}/workflows/{workflowID}/schedules", s.DeleteSchedule)
			}
			if s.webhooks != nil {
				router.Post("/projects/{projectID}/workflows/{workflowID}/webhooks", s.CreateWebhook)
				router.Get("/projects/{projectID}/workflows/{workflowID}/webhooks/{webhookID}", s.GetWebhook)
				router.Patch("/projects/{projectID}/workflows/{workflowID}/webhooks/{webhookID}", s.UpdateWebhook)
				router.Delete("/projects/{projectID}/workflows/{workflowID}/webhooks/{webhookID}", s.DeleteWebhook)
			}
			if s.observ != nil {
				router.Get("/executions/{executionID}/events", s.ListExecutionEvents)
				router.Get("/executions/{executionID}/logs", s.ListExecutionLogs)
				router.Get("/executions/{executionID}/attempts", s.ListExecutionAttempts)
				router.Get("/workers", s.ListWorkers)
				router.Get("/queue", s.QueueMetrics)
				router.Get("/metrics", s.MetricsView)
			}
		})
	})
	return router
}
