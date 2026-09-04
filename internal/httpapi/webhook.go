package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/webhook"
	"github.com/neyati/flowforge/internal/workflow"
)

type createWebhookRequest struct {
	Secret string `json:"secret"`
}

type createWebhookResponse struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	Secret    string    `json:"secret"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
}

type webhookResponse struct {
	ID        string    `json:"id"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// webhookTimestampTolerance bounds how old a replayable webhook timestamp may
// be. Signature-only verification is enough for V1; the timestamp adds a
// cheap replay window so an attacker cannot silently re-deliver an old,
// already-processed payload with a fresh signature.
const webhookTimestampTolerance = 5 * time.Minute

func (s *Server) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.webhooks == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "webhooks not configured")
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

	var req createWebhookRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Secret == "" {
		writeError(w, http.StatusBadRequest, "invalid_secret", "webhook secret is required")
		return
	}

	now := time.Now().UTC()
	webhookID := "wh_" + uuid.New().String()[:12]

	wh := webhook.Webhook{
		ID:         webhookID,
		ProjectID:  projectID,
		WorkflowID: workflowID,
		Enabled:    true,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	// Store the raw secret material. The secret is shown once at creation and
	// is required to verify HMAC signatures on subsequent deliveries.
	if err := s.webhooks.Create(r.Context(), wh, req.Secret); err != nil {
		writeError(w, http.StatusInternalServerError, "webhook_create_failed", "unable to create webhook")
		return
	}

	webhookURL := "/api/v1/webhooks/" + webhookID

	writeJSON(w, http.StatusCreated, createWebhookResponse{
		ID:        webhookID,
		URL:       webhookURL,
		Secret:    req.Secret,
		Enabled:   true,
		CreatedAt: now,
	})
}

func (s *Server) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if s.webhooks == nil || s.executions == nil || s.idempotency == nil || s.engine == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "webhooks not configured")
		return
	}

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
		return
	}

	// Read payload
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_payload", "unable to read request body")
		return
	}
	defer r.Body.Close()

	// Public lookup by ID along: the webhook is invoked without a user token.
	wh, err := s.webhooks.GetByPublicID(r.Context(), webhookID)
	if errors.Is(err, webhook.ErrNotFound) {
		writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "webhook_lookup_failed", "unable to retrieve webhook")
		return
	}

	if !wh.Enabled {
		writeError(w, http.StatusForbidden, "webhook_disabled", "this webhook is disabled")
		return
	}

	// Verify timestamp for replay protection (optional header).
	if timestampHeader := r.Header.Get("X-Webhook-Timestamp"); timestampHeader != "" {
		ts, parseErr := strconv.ParseInt(timestampHeader, 10, 64)
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid_timestamp", "webhook timestamp must be a unix epoch integer")
			return
		}
		received := time.Unix(ts, 0).UTC()
		if time.Since(received) > webhookTimestampTolerance {
			writeError(w, http.StatusUnauthorized, "stale_timestamp", "webhook timestamp is too old")
			return
		}
		if received.After(time.Now().UTC().Add(webhookTimestampTolerance)) {
			writeError(w, http.StatusUnauthorized, "future_timestamp", "webhook timestamp is in the future")
			return
		}
	}

	// Verify signature from header.
	signature := r.Header.Get("X-Webhook-Signature")
	if signature == "" {
		writeError(w, http.StatusUnauthorized, "missing_signature", "webhook signature required")
		return
	}

	secret, err := s.webhooks.GetSecretHash(r.Context(), webhookID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "webhook_secret_lookup_failed", "unable to verify webhook")
		return
	}

	if !webhook.VerifySignature(secret, payload, signature) {
		writeError(w, http.StatusUnauthorized, "invalid_signature", "webhook signature verification failed")
		return
	}

	// A disabled (paused/deactivated) workflow must not accept new runs.
	activeVersionID, err := s.workflows.GetActiveVersion(r.Context(), wh.WorkflowID)
	if errors.Is(err, workflow.ErrNotFound) {
		writeError(w, http.StatusConflict, "workflow_not_active", "workflow is not active")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workflow_lookup_failed", "unable to retrieve workflow")
		return
	}

	// The execution ownership check needs the project owner, not the project ID.
	ownerID, err := s.projects.GetOwner(r.Context(), wh.ProjectID)
	if err != nil {
		writeError(w, http.StatusNotFound, "project_not_found", "project not found")
		return
	}

	// Use delivery ID for idempotency.
	deliveryID := r.Header.Get("X-Delivery-ID")
	if deliveryID == "" {
		deliveryID = "manual-" + uuid.New().String()
	}

	// Fast path: a delivery already processed returns the original acceptance.
	// The concurrent-race safety net is the atomic reservation in
	// CreateOwnedWithIdempotency below, which reserves the delivery key in the
	// same transaction as execution creation.
	_, err = s.idempotency.GetExecutionByIdempotencyKey(r.Context(), wh.ProjectID, deliveryID)
	if err == nil {
		// Already processed, return success.
		writeJSON(w, http.StatusOK, map[string]string{"status": "already_processed"})
		return
	} else if err != execution.ErrIdempotencyNotFound {
		writeError(w, http.StatusInternalServerError, "idempotency_check_failed", "unable to check idempotency")
		return
	}

	// Create execution.
	now := time.Now().UTC()
	input := json.RawMessage(payload)
	if len(payload) == 0 {
		input = json.RawMessage(`{}`)
	}

	// Atomically create the execution and reserve the delivery idempotency key
	// in one transaction, so two concurrent deliveries with the same
	// X-Delivery-ID cannot both create executions.
	execRecord, err := s.executions.CreateOwnedWithIdempotency(r.Context(), ownerID, wh.WorkflowID, activeVersionID, input, now, wh.ProjectID, deliveryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "execution_create_failed", "unable to create execution")
		return
	}

	// Webhook-triggered workflows must flow through the same orchestration path
	// as manual/API triggers, otherwise the created execution is never processed.
	s.engine.Start(context.Background(), ownerID, execRecord.ID)

	writeJSON(w, http.StatusAccepted, map[string]string{
		"execution_id": execRecord.ID.String(),
	})
}

func (s *Server) GetWebhook(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.webhooks == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "webhooks not configured")
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

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
		return
	}

	wh, err := s.webhooks.GetByID(r.Context(), projectID, webhookID)
	if errors.Is(err, webhook.ErrNotFound) {
		writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "webhook_lookup_failed", "unable to retrieve webhook")
		return
	}

	writeJSON(w, http.StatusOK, webhookResponse{
		ID:        wh.ID,
		Enabled:   wh.Enabled,
		CreatedAt: wh.CreatedAt,
		UpdatedAt: wh.UpdatedAt,
	})
}

func (s *Server) UpdateWebhook(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.webhooks == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "webhooks not configured")
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

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := s.webhooks.UpdateEnabled(r.Context(), projectID, webhookID, req.Enabled, time.Now().UTC()); err != nil {
		if errors.Is(err, webhook.ErrNotFound) {
			writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "webhook_update_failed", "unable to update webhook")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if s.webhooks == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "webhooks not configured")
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

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
		return
	}

	if err := s.webhooks.Delete(r.Context(), projectID, webhookID); err != nil {
		if errors.Is(err, webhook.ErrNotFound) {
			writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "webhook_delete_failed", "unable to delete webhook")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
