package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/trial"
)

// trialUsageResponse is everything the client needs to render the trial
// identity and the AI usage counter: whether this caller is on the public
// trial, the server-enforced allowance, what has been consumed, and what is
// left. The numbers come from the same table the server enforces against, so
// the UI can never show a more generous limit than the one actually applied.
type trialUsageResponse struct {
	IsTrial   bool         `json:"is_trial"`
	AIEnabled bool         `json:"ai_enabled"`
	Limits    trial.Limits `json:"limits"`
	Usage     trial.Usage  `json:"usage"`
	Remaining trial.Usage  `json:"remaining"`
}

// TrialUsage reports the caller's trial AI consumption. Registered users get
// is_trial = false with zeroed counters, which is how the client decides not to
// show a trial indicator or an AI quota to a normal account.
func (s *Server) TrialUsage(w http.ResponseWriter, r *http.Request) {
	ownerID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	response := trialUsageResponse{AIEnabled: s.ai != nil && s.ai.Enabled()}
	if s.trial != nil {
		response.Limits = s.trial.Limits()
	}

	stored, err := s.users.GetByID(r.Context(), ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	response.IsTrial = stored.IsTrial

	// Only trial accounts accrue usage; a registered user's counters stay zero
	// so the client never renders an exhausted AI quota for them.
	if stored.IsTrial && s.trial != nil {
		usage, err := s.trial.Current(r.Context(), ownerID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "trial_usage_failed", "unable to read AI usage")
			return
		}
		response.Usage = usage
		response.Remaining = response.Limits.Remaining(usage)
	}

	writeJSON(w, http.StatusOK, response)
}

// beginTrialAIUse enforces the trial AI allowance for a single AI request.
//
// It charges one use of kind when the caller is a trial account and returns a
// refund function the caller must invoke if the AI provider failed for a reason
// the visitor should not pay for (an outage or a misconfiguration). Registered
// users are never limited: they receive a no-op refund and ok = true.
//
// When the allowance is exhausted it writes a 429 with a distinct code so the
// client can explain the situation, and returns ok = false; the caller must
// then return without contacting the provider. This is the only place the trial
// AI limit is applied, so it cannot be bypassed by a different client.
func (s *Server) beginTrialAIUse(w http.ResponseWriter, r *http.Request, ownerID uuid.UUID, kind trial.Kind) (refund func(), ok bool) {
	noRefund := func() {}

	// Without a wired repository there is no trial accounting to enforce. The
	// trial entry point is not mounted in that configuration either.
	if s.trial == nil {
		return noRefund, true
	}

	stored, err := s.users.GetByID(r.Context(), ownerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "trial_lookup_failed", "unable to verify account")
		return noRefund, false
	}
	if !stored.IsTrial {
		return noRefund, true
	}

	if _, err := s.trial.Consume(r.Context(), ownerID, kind); err != nil {
		if errors.Is(err, trial.ErrLimitExceeded) {
			writeError(w, http.StatusTooManyRequests, "trial_ai_limit_reached",
				"The free trial AI limit has been reached. Create a free account to keep using AI features.")
			return noRefund, false
		}
		writeError(w, http.StatusInternalServerError, "trial_usage_failed", "unable to record AI usage")
		return noRefund, false
	}

	// The compensating update must not be cancelled along with the request, so
	// it runs on a context detached from the handler's.
	refundCtx := context.WithoutCancel(r.Context())
	return func() {
		_ = s.trial.Refund(refundCtx, ownerID, kind)
	}, true
}
