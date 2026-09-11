package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/neyati/flowforge/internal/ai"
	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/observ"
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
	database       Database
	users          user.Repository
	projects       project.Repository
	workflows      workflow.Repository
	executions     execution.Repository
	engine         *execution.Engine
	tokens         *auth.TokenService
	schedules      schedule.Repository
	webhooks       webhook.Repository
	idempotency    execution.IdempotencyRepository
	observ         observ.Repository
	logger         *slog.Logger
	maxBodyBytes   int64
	authLimiter    *tokenBucket
	webhookLimiter *tokenBucket
	ai             *ai.Generator
}

// SetAI wires the optional AI workflow generator. It must be called before
// Router() so the generation endpoint is mounted. A nil or disabled generator
// makes the feature report itself as unavailable.
func (s *Server) SetAI(generator *ai.Generator) {
	s.ai = generator
}

// SetObservatory wires the optional observability read/event repository. It
// must be called before Router() so the observability endpoints are mounted.
func (s *Server) SetObservatory(repository observ.Repository) {
	s.observ = repository
}

// SetLimits configures request body size and per-client-IP rate limits for the
// control plane. Zero/negative values disable the corresponding limit. It must
// be called before Router() so the middleware is mounted.
func (s *Server) SetLimits(maxBodyBytes int64, authRPS, authBurst, webhookRPS, webhookBurst int) {
	s.maxBodyBytes = maxBodyBytes
	s.authLimiter = newTokenBucket(float64(authRPS), float64(authBurst))
	s.webhookLimiter = newTokenBucket(float64(webhookRPS), float64(webhookBurst))
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
