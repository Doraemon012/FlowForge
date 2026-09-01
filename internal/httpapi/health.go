package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/schedule"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/webhook"
	"github.com/neyati/flowforge/internal/workflow"
)

type Database interface {
	Ping(context.Context) error
}

type Server struct {
	database    Database
	users       user.Repository
	projects    project.Repository
	workflows   workflow.Repository
	executions  execution.Repository
	engine      *execution.Engine
	tokens      *auth.TokenService
	schedules   schedule.Repository
	webhooks    webhook.Repository
	idempotency execution.IdempotencyRepository
	logger      *slog.Logger
}

func NewServer(database Database) *Server {
	return &Server{database: database}
}

func NewAuthenticatedServer(database Database, users user.Repository, projects project.Repository, workflows workflow.Repository, tokens *auth.TokenService) *Server {
	return &Server{database: database, users: users, projects: projects, workflows: workflows, tokens: tokens}
}

func NewExecutionServer(
	database Database,
	users user.Repository,
	projects project.Repository,
	workflows workflow.Repository,
	executions execution.Repository,
	engine *execution.Engine,
	tokens *auth.TokenService,
	schedules schedule.Repository,
	webhooks webhook.Repository,
	idempotency execution.IdempotencyRepository,
	logger *slog.Logger,
) *Server {
	return &Server{
		database:    database,
		users:       users,
		projects:    projects,
		workflows:   workflows,
		executions:  executions,
		engine:      engine,
		tokens:      tokens,
		schedules:   schedules,
		webhooks:    webhooks,
		idempotency: idempotency,
		logger:      logger,
	}
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
