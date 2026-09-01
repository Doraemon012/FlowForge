package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
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

	// Hash the secret for storage
	secretHash := webhook.SignPayload(req.Secret, []byte(webhookID))

	wh := webhook.Webhook{
		ID:         webhookID,
		ProjectID:  projectID,
		WorkflowID: workflowID,
		Enabled:    true,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if err := s.webhooks.Create(r.Context(), wh, secretHash); err != nil {
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
	if s.webhooks == nil || s.executions == nil || s.idempotency == nil {
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

	// Get webhook
	// Note: we don't know projectID yet, so we fetch without project constraint
	// In production, the webhook table should have a full URL or we need to lookup differently
	// For now, we'll fetch by ID only (less secure but matches current schema)
	wh, err := s.webhooks.GetByID(r.Context(), uuid.Nil, webhookID)
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

	// Get secret hash for verification
	secretHash, err := s.webhooks.GetSecretHash(r.Context(), webhookID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "webhook_secret_lookup_failed", "unable to verify webhook")
		return
	}

	// Verify signature from header
	signature := r.Header.Get("X-Webhook-Signature")
	if signature == "" {
		writeError(w, http.StatusUnauthorized, "missing_signature", "webhook signature required")
		return
	}

	// Extract the secret from the signature verification
	// In this case, we need to verify that the signature is valid
	// This is a simplified version - in production, you'd have the secret stored securely
	if !verifyWebhookSignature(payload, secretHash, signature) {
		writeError(w, http.StatusUnauthorized, "invalid_signature", "webhook signature verification failed")
		return
	}

	// Use delivery ID for idempotency
	deliveryID := r.Header.Get("X-Delivery-ID")
	if deliveryID == "" {
		deliveryID = "manual-" + uuid.New().String()
	}

	// Check idempotency
	_, err = s.idempotency.GetExecutionByIdempotencyKey(r.Context(), wh.ProjectID, deliveryID)
	if err == nil {
		// Already processed, return success
		w.WriteHeader(http.StatusOK)
		return
	} else if err != execution.ErrIdempotencyNotFound {
		writeError(w, http.StatusInternalServerError, "idempotency_check_failed", "unable to check idempotency")
		return
	}

	// Create execution
	now := time.Now().UTC()
	input := json.RawMessage(payload)
	if len(payload) == 0 {
		input = json.RawMessage(`{}`)
	}

	execRecord, err := s.executions.CreateOwned(r.Context(), wh.ProjectID, wh.WorkflowID, uuid.Nil, input, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "execution_create_failed", "unable to create execution")
		return
	}

	// Record idempotency key
	if err := s.idempotency.RecordIdempotencyKey(r.Context(), wh.ProjectID, execRecord.ID, deliveryID, now); err != nil {
		// Log but don't fail - execution was created
		s.logger.Error("record webhook idempotency", "webhook_id", webhookID, "error", err)
	}

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

// verifyWebhookSignature checks if the provided signature matches the payload
func verifyWebhookSignature(payload []byte, secretHash, signature string) bool {
	// In a real implementation, this would verify using HMAC-SHA256
	// For now, we verify that the signature is valid
	// This is a simplified implementation
	expected := webhook.SignPayload(secretHash, payload)
	return expected == signature
}
