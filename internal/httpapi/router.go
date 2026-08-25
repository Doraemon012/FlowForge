package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) Router() http.Handler {
	router := chi.NewRouter()
	router.Get("/health", s.Health)
	return router
}
