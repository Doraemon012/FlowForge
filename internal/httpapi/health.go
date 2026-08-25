package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type Database interface {
	Ping(context.Context) error
}

type Server struct {
	database Database
}

func NewServer(database Database) *Server {
	return &Server{database: database}
}

func (s *Server) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()

	status := http.StatusOK
	body := map[string]string{"status": "ok", "database": "ok"}
	if err := s.database.Ping(ctx); err != nil {
		status = http.StatusServiceUnavailable
		body = map[string]string{"status": "degraded", "database": "unavailable"}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
