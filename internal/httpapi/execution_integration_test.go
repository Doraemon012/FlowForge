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
	"github.com/neyati/flowforge/internal/execution"
	"github.com/neyati/flowforge/internal/project"
	"github.com/neyati/flowforge/internal/user"
	"github.com/neyati/flowforge/internal/workflow"
)

func TestExecutionRunsLinearWorkflowAndPinsVersion(t *testing.T) {
	handler, pool := phase4Handler(t)
	defer pool.Close()
	token := registerAndLogin(t, handler, "execution-linear-"+time.Now().Format("150405.000000000")+"@example.com", "Linear")
	otherToken := registerAndLogin(t, handler, "execution-other-"+time.Now().Format("150405.000000000")+"@example.com", "Other")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{"step":"a"}}`)}, {ID: "b", Type: "transform", Config: json.RawMessage(`{"output":{"step":"b"}}`), Dependencies: []string{"a"}}, {ID: "c", Type: "delay", Config: json.RawMessage(`{"seconds":0}`), Dependencies: []string{"b"}}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]string{"source": "test"}}, token)
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d, body = %s", response.Code, response.Body.String())
	}
	var created execution.Execution
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	waitForExecution(t, handler, token, created.ID.String(), "completed")
	tasks := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+created.ID.String()+"/tasks", nil, token)
	if tasks.Code != http.StatusOK {
		t.Fatalf("task listing status = %d", tasks.Code)
	}
	var runs []execution.TaskRun
	if err := json.NewDecoder(tasks.Body).Decode(&runs); err != nil {
		t.Fatal(err)
	}
	if len(runs) != 3 || runs[0].Status != "succeeded" || runs[1].Status != "succeeded" || runs[2].Status != "succeeded" {
		t.Fatalf("unexpected task runs: %+v", runs)
	}
	if created.WorkflowVersionID.String() != versionID {
		t.Fatalf("execution version = %s, want %s", created.WorkflowVersionID, versionID)
	}
	if response := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+created.ID.String(), nil, otherToken); response.Code != http.StatusNotFound {
		t.Fatalf("cross-user execution status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestExecutionRunsBranchesAndBlocksAfterFailure(t *testing.T) {
	handler, pool := phase4Handler(t)
	defer pool.Close()
	token := registerAndLogin(t, handler, "execution-branch-"+time.Now().Format("150405.000000000")+"@example.com", "Branch")
	projectID := createTestProject(t, handler, token)
	definition := workflow.Definition{Tasks: []workflow.Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}, {ID: "b", Type: "transform", Config: json.RawMessage(`{"output":{}}`), Dependencies: []string{"a"}}, {ID: "c", Type: "delay", Config: json.RawMessage(`{"seconds":0}`), Dependencies: []string{"a"}}, {ID: "d", Type: "transform", Config: json.RawMessage(`{"output":{}}`), Dependencies: []string{"b", "c"}}}}
	workflowID, versionID := createAndPublishWorkflow(t, handler, token, projectID, definition)
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": versionID, "input": map[string]any{}}, token)
	var created execution.Execution
	if response.Code != http.StatusAccepted {
		t.Fatalf("create execution status = %d", response.Code)
	}
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	waitForExecution(t, handler, token, created.ID.String(), "completed")

	failureDefinition := workflow.Definition{Tasks: []workflow.Task{{ID: "a", Type: "transform", Config: json.RawMessage(`{"output":{}}`)}, {ID: "bad", Type: "delay", Config: json.RawMessage(`{"seconds":"invalid"}`), Dependencies: []string{"a"}}, {ID: "downstream", Type: "transform", Config: json.RawMessage(`{"output":{}}`), Dependencies: []string{"bad"}}}}
	if response := requestJSON(handler, http.MethodPatch, "/api/v1/projects/"+projectID+"/workflows/"+workflowID, map[string]any{"name": "Branch", "definition": failureDefinition}, token); response.Code != http.StatusOK {
		t.Fatalf("failure draft update status = %d", response.Code)
	}
	failureVersion := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/versions", nil, token)
	if failureVersion.Code != http.StatusCreated {
		t.Fatalf("failure version publish status = %d, body = %s", failureVersion.Code, failureVersion.Body.String())
	}
	var publishedFailure workflow.Version
	if err := json.NewDecoder(failureVersion.Body).Decode(&publishedFailure); err != nil {
		t.Fatal(err)
	}
	failureExecution := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows/"+workflowID+"/executions", map[string]any{"version_id": publishedFailure.ID, "input": map[string]any{}}, token)
	if failureExecution.Code != http.StatusAccepted {
		t.Fatalf("failure execution status = %d", failureExecution.Code)
	}
	var failed execution.Execution
	if err := json.NewDecoder(failureExecution.Body).Decode(&failed); err != nil {
		t.Fatal(err)
	}
	waitForExecution(t, handler, token, failed.ID.String(), "failed")
	failureTasks := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+failed.ID.String()+"/tasks", nil, token)
	var failureRuns []execution.TaskRun
	if err := json.NewDecoder(failureTasks.Body).Decode(&failureRuns); err != nil {
		t.Fatal(err)
	}
	if len(failureRuns) != 3 || failureRuns[1].Status != "failed" || failureRuns[2].Status != "blocked" {
		t.Fatalf("unexpected failure runs: %+v", failureRuns)
	}
}

func phase4Handler(t *testing.T) (http.Handler, interface{ Close() }) {
	t.Helper()
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
	repository := execution.NewPostgresRepository(pool)
	return NewExecutionServer(pool, user.NewPostgresRepository(pool), project.NewPostgresRepository(pool), workflow.NewPostgresRepository(pool), repository, execution.NewEngine(repository, execution.NewBuiltinRuntime(nil)), auth.NewTokenService("01234567890123456789012345678901")).Router(), pool
}

func createTestProject(t *testing.T, handler http.Handler, token string) string {
	t.Helper()
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects", map[string]string{"name": "Execution Project " + time.Now().Format("150405.000000000")}, token)
	if response.Code != http.StatusCreated {
		t.Fatalf("create project status = %d", response.Code)
	}
	var created project.Project
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	return created.ID.String()
}

func createAndPublishWorkflow(t *testing.T, handler http.Handler, token, projectID string, definition workflow.Definition) (string, string) {
	t.Helper()
	response := requestJSON(handler, http.MethodPost, "/api/v1/projects/"+projectID+"/workflows", map[string]any{"name": "Execution Workflow " + time.Now().Format("150405.000000000"), "definition": definition}, token)
	if response.Code != http.StatusCreated {
		t.Fatalf("create workflow status = %d, body = %s", response.Code, response.Body.String())
	}
	var created workflow.Workflow
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/projects/" + projectID + "/workflows/" + created.ID.String()
	response = requestJSON(handler, http.MethodPost, path+"/versions", nil, token)
	if response.Code != http.StatusCreated {
		t.Fatalf("publish workflow status = %d, body = %s", response.Code, response.Body.String())
	}
	var version workflow.Version
	if err := json.NewDecoder(response.Body).Decode(&version); err != nil {
		t.Fatal(err)
	}
	return created.ID.String(), version.ID.String()
}

func waitForExecution(t *testing.T, handler http.Handler, token, executionID, wanted string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		response := requestJSON(handler, http.MethodGet, "/api/v1/executions/"+executionID, nil, token)
		var current execution.Execution
		if response.Code == http.StatusOK && json.NewDecoder(response.Body).Decode(&current) == nil && current.Status == wanted {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("execution %s did not reach %s", executionID, wanted)
}
