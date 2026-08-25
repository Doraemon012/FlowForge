package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) Router() http.Handler {
	router := chi.NewRouter()
	router.Get("/health", s.Health)
	if s.users == nil || s.projects == nil || s.tokens == nil {
		return router
	}
	router.Route("/api/v1", func(router chi.Router) {
		router.Post("/auth/register", s.Register)
		router.Post("/auth/login", s.Login)
		router.Group(func(router chi.Router) {
			router.Use(s.RequireAuth)
			router.Post("/projects", s.CreateProject)
			router.Get("/projects", s.ListProjects)
			router.Get("/projects/{projectID}", s.GetProject)
			router.Patch("/projects/{projectID}", s.UpdateProject)
			router.Delete("/projects/{projectID}", s.DeleteProject)
		})
	})
	return router
}
