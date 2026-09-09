package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/user"
)

type contextKey string

const userIDKey contextKey = "authenticated-user-id"

type authRequest struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

type authResponse struct {
	UserID      uuid.UUID `json:"user_id"`
	AccessToken string    `json:"access_token"`
	TokenType   string    `json:"token_type"`
	ExpiresIn   int64     `json:"expires_in"`
}

type meResponse struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (s *Server) Register(w http.ResponseWriter, r *http.Request) {
	var request authRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if !validAuthRequest(request, true) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "invalid registration request")
		return
	}
	hash, err := auth.HashPassword(request.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "registration_failed", "unable to register user")
		return
	}
	now := time.Now().UTC()
	newUser := user.User{ID: uuid.New(), Email: normalizeEmail(request.Email), DisplayName: strings.TrimSpace(request.DisplayName), PasswordHash: hash, Status: "active", CreatedAt: now, UpdatedAt: now}
	if err := s.users.Create(r.Context(), newUser); err != nil {
		writeError(w, http.StatusConflict, "email_unavailable", "unable to register user")
		return
	}
	s.issueToken(w, newUser.ID)
}

func (s *Server) Login(w http.ResponseWriter, r *http.Request) {
	var request authRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if !validAuthRequest(request, false) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "invalid login request")
		return
	}

	stored, err := s.users.GetByEmail(r.Context(), normalizeEmail(request.Email))
	if err != nil || stored.Status != "active" || !auth.CheckPassword(stored.PasswordHash, request.Password) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}
	s.issueToken(w, stored.ID)
}

func (s *Server) issueToken(w http.ResponseWriter, userID uuid.UUID) {
	const lifetime = 15 * time.Minute
	token, err := s.tokens.Issue(userID, lifetime)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token_issuance_failed", "unable to issue access token")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{UserID: userID, AccessToken: token, TokenType: "Bearer", ExpiresIn: int64(lifetime.Seconds())})
}

func (s *Server) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := authenticatedUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	stored, err := s.users.GetByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	writeJSON(w, http.StatusOK, meResponse{
		ID:          stored.ID,
		Email:       stored.Email,
		DisplayName: stored.DisplayName,
		Status:      stored.Status,
		CreatedAt:   stored.CreatedAt,
		UpdatedAt:   stored.UpdatedAt,
	})
}

func (s *Server) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		userID, err := s.tokens.Parse(parts[1])
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey, userID)))
	})
}

func authenticatedUserID(ctx context.Context) (uuid.UUID, bool) {
	userID, ok := ctx.Value(userIDKey).(uuid.UUID)
	return userID, ok && userID != uuid.Nil
}

func validAuthRequest(request authRequest, registration bool) bool {
	if _, err := mail.ParseAddress(request.Email); err != nil || !strings.Contains(request.Email, "@") || len(request.Password) < 8 {
		return false
	}
	if registration && strings.TrimSpace(request.DisplayName) == "" {
		return false
	}
	return true
}

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func decodeJSON(w http.ResponseWriter, r *http.Request, destination any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "invalid request body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
