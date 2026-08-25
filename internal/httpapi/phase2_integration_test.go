package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/user"
)

func TestPhase2AuthenticationAndProjectOwnership(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	pool, err := db.Open(context.Background(), databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()

	server := NewAuthenticatedServer(pool, user.NewPostgresRepository(pool), project.NewPostgresRepository(pool), auth.NewTokenService("01234567890123456789012345678901"))
	handler := server.Router()

	userAEmail := "user-a-" + time.Now().Format("20060102150405.000000000") + "@example.com"
	userBEmail := "user-b-" + time.Now().Format("20060102150405.000000000") + "@example.com"
	tokenA := registerAndLogin(t, handler, userAEmail, "User A")
	if response := requestJSON(handler, http.MethodPost, "/api/v1/auth/register", map[string]string{"email": "invalid", "display_name": "", "password": "short"}, ""); response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid registration status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
	tokenB := registerAndLogin(t, handler, userBEmail, "User B")

	projectResponse := requestJSON(handler, http.MethodPost, "/api/v1/projects", map[string]string{"name": "Project A"}, tokenA)
	if projectResponse.Code != http.StatusCreated {
		t.Fatalf("create project status = %d, body = %s", projectResponse.Code, projectResponse.Body.String())
	}
	var created project.Project
	if err := json.NewDecoder(projectResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode project: %v", err)
	}

	for _, method := range []string{http.MethodGet, http.MethodPatch, http.MethodDelete} {
		body := any(nil)
		if method == http.MethodPatch {
			body = map[string]string{"name": "Hijacked"}
		}
		response := requestJSON(handler, method, "/api/v1/projects/"+created.ID.String(), body, tokenB)
		if response.Code != http.StatusNotFound {
			t.Fatalf("User B %s status = %d, want %d", method, response.Code, http.StatusNotFound)
		}
	}

	owned := requestJSON(handler, http.MethodGet, "/api/v1/projects/"+created.ID.String(), nil, tokenA)
	if owned.Code != http.StatusOK {
		t.Fatalf("User A get status = %d, want %d", owned.Code, http.StatusOK)
	}
	updated := requestJSON(handler, http.MethodPatch, "/api/v1/projects/"+created.ID.String(), map[string]string{"name": "Project A Updated"}, tokenA)
	if updated.Code != http.StatusOK {
		t.Fatalf("User A patch status = %d, want %d", updated.Code, http.StatusOK)
	}
	if response := requestJSON(handler, http.MethodGet, "/api/v1/projects", nil, ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated project status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
	if response := requestJSON(handler, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": userAEmail, "password": "wrong password"}, ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("invalid login status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
	if response := requestJSON(handler, http.MethodDelete, "/api/v1/projects/"+created.ID.String(), nil, tokenA); response.Code != http.StatusNoContent {
		t.Fatalf("User A delete status = %d, want %d", response.Code, http.StatusNoContent)
	}
}

func registerAndLogin(t *testing.T, handler http.Handler, email, displayName string) string {
	t.Helper()
	response := requestJSON(handler, http.MethodPost, "/api/v1/auth/register", map[string]string{"email": email, "display_name": displayName, "password": "correct horse battery staple"}, "")
	if response.Code != http.StatusOK {
		t.Fatalf("registration status = %d, body = %s", response.Code, response.Body.String())
	}
	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil || result.AccessToken == "" {
		t.Fatalf("invalid registration response: %v", err)
	}
	return result.AccessToken
}

func requestJSON(handler http.Handler, method, path string, body any, token string) *httptest.ResponseRecorder {
	var payload bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&payload).Encode(body)
	}
	request := httptest.NewRequest(method, path, &payload)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
