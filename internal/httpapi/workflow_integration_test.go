package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/neyati/flowforge/internal/auth"
	"github.com/neyati/flowforge/internal/db"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/workflow"
)

func TestWorkflowLifecycleAndIsolation(t *testing.T) {
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
	handler := NewAuthenticatedServer(pool, user.NewPostgresRepository(pool), project.NewPostgresRepository(pool), workflow.NewPostgresRepository(pool), auth.NewTokenService("01234567890123456789012345678901")).Router()

	timestamp := time.Now().UTC().Format("20060102150405.000000000")
	tokenA := registerAndLogin(t, handler, "workflow-a-"+timestamp+"@example.com", "Workflow A")
	tokenB := registerAndLogin(t, handler, "workflow-b-"+timestamp+"@example.com", "Workflow B")
	projectResponse := requestJSON(handler, http.MethodPost, "/api/v1/projects", map[string]string{"name": "Workflow Project " + timestamp}, tokenA)
	if projectResponse.Code != http.StatusCreated {
		t.Fatalf("create project status = %d", projectResponse.Code)
	}
	var ownedProject project.Project
	if err := json.NewDecoder(projectResponse.Body).Decode(&ownedProject); err != nil {
		t.Fatalf("decode project: %v", err)
	}

	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "start", Type: "transform", Config: json.RawMessage(`{"value":"one"}`)}, {ID: "finish", Type: "delay", Config: json.RawMessage(`{"seconds":1}`), Dependencies: []string{"start"}}}}
	createBody := map[string]any{"name": "Example Workflow", "description": "draft", "definition": definition}
	workflowResponse := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+ownedProject.ID.String()+"/workflows", createBody, tokenA)
	if workflowResponse.Code != http.StatusCreated {
		t.Fatalf("create workflow status = %d, body = %s", workflowResponse.Code, workflowResponse.Body.String())
	}
	var created workflow.Workflow
	if err := json.NewDecoder(workflowResponse.Body).Decode(&created); err != nil {
		t.Fatalf("decode workflow: %v", err)
	}
	basePath := "/api/v1/projects/" + ownedProject.ID.String() + "/workflows/" + created.ID.String()
	if response := requestJSON(handler, http.MethodPost, basePath+"/validate", nil, tokenA); response.Code != http.StatusOK {
		t.Fatalf("validate status = %d", response.Code)
	}

	versionResponse := requestJSON(handler, http.MethodPost, basePath+"/versions", nil, tokenA)
	if versionResponse.Code != http.StatusCreated {
		t.Fatalf("publish status = %d, body = %s", versionResponse.Code, versionResponse.Body.String())
	}
	var firstVersion workflow.Version
	if err := json.NewDecoder(versionResponse.Body).Decode(&firstVersion); err != nil {
		t.Fatalf("decode version: %v", err)
	}
	if firstVersion.VersionNumber != 1 {
		t.Fatalf("version number = %d, want 1", firstVersion.VersionNumber)
	}

	updatedDefinition := workflow.Definition{Tasks: append(definition.Tasks, workflow.Task{ID: "extra", Type: "email", Config: json.RawMessage(`{"to":"test@example.com"}`), Dependencies: []string{"finish"}})}
	updateBody := map[string]any{"name": "Example Workflow", "description": "updated draft", "definition": updatedDefinition}
	if response := requestJSON(handler, http.MethodPatch, basePath, updateBody, tokenA); response.Code != http.StatusOK {
		t.Fatalf("update draft status = %d", response.Code)
	}
	storedVersion := requestJSON(handler, http.MethodGet, basePath+"/versions/"+firstVersion.ID.String(), nil, tokenA)
	if storedVersion.Code != http.StatusOK {
		t.Fatalf("get version status = %d", storedVersion.Code)
	}
	var unchanged workflow.Version
	if err := json.NewDecoder(storedVersion.Body).Decode(&unchanged); err != nil {
		t.Fatalf("decode stored version: %v", err)
	}
	if len(unchanged.Definition.Tasks) != 2 || unchanged.Definition.Tasks[0].Config == nil {
		t.Fatalf("published version was changed: %+v", unchanged.Definition)
	}
	if response := requestJSON(handler, http.MethodPost, basePath+"/versions", nil, tokenA); response.Code != http.StatusCreated {
		t.Fatalf("second publish status = %d", response.Code)
	}
	if response := requestJSON(handler, http.MethodGet, basePath+"/versions", nil, tokenA); response.Code != http.StatusOK {
		t.Fatalf("list versions status = %d", response.Code)
	}

	for _, method := range []string{http.MethodGet, http.MethodPatch, http.MethodPost} {
		body := any(nil)
		if method == http.MethodPatch {
			body = updateBody
		}
		path := basePath
		if method == http.MethodPost {
			path += "/versions"
		}
		if response := requestJSON(handler, method, path, body, tokenB); response.Code != http.StatusNotFound {
			t.Fatalf("User B %s status = %d, want %d", method, response.Code, http.StatusNotFound)
		}
	}

	cycleDefinition := workflow.Definition{Tasks: []workflow.Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{}`), Dependencies: []string{"b"}}, {ID: "b", Type: "transform", Config: json.RawMessage(`{}`), Dependencies: []string{"a"}}}}
	cycleResponse := requestJSON(handler, http.MethodPatch, basePath, map[string]any{"name": "Example Workflow", "description": "cycle", "definition": cycleDefinition}, tokenA)
	if cycleResponse.Code != http.StatusOK {
		t.Fatalf("cycle draft update status = %d", cycleResponse.Code)
	}
	if response := requestJSON(handler, http.MethodPost, basePath+"/versions", nil, tokenA); response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("cyclic publish status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
}
