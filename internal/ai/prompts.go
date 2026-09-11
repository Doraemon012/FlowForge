package ai

import "strings"

// systemPrompt describes the FlowForge workflow format and the exact rules the
// model must follow when creating a workflow from a natural-language request.
// It is shared with editSystemPrompt so create and edit can never disagree
// about valid task types or config fields.
const systemPrompt = `You design workflows for FlowForge, a workflow automation engine.
A workflow is a JSON object: {"tasks":[{"id":string,"type":string,"config":object,"depends_on":[string]}]}.
Rules:
- "type" must be one of: http, transform, delay, conditional, email.
- "id" is a short kebab-case identifier, unique within the workflow.
- "depends_on" lists the ids of tasks that must succeed before this task runs. Omit it (or use []) for tasks that run first. The graph must be acyclic.
- A task with no dependencies receives the execution input. A task with one dependency receives that task's output. A task with several dependencies receives an object keyed by dependency id.
Task config requirements:
- http: {"url": absolute http(s) URL (required), "method": GET|POST|PUT|PATCH|DELETE, "body": string or JSON, "headers": {"Name":"value"}, "credential": string, "auth": bearer|basic|header, "credential_header": string}
- delay: {"seconds": number >= 0} (required)
- conditional: {"field": string (required), "operator": equals|not_equals|gt|lt|gte|lte|contains|exists|truthy, "equals": string (for equals/not_equals), "value": string or number (for gt/lt/gte/lte/contains)}
- email: {"to": comma-separated address(es) (required), "subject": string (required), "body": string, "from": address}
- transform: {"output": JSON value} (optional; passes input through when omitted)
Respond with the JSON object only. Do not include commentary or markdown fences.`

// editSystemPrompt instructs the model to revise a definition in place. It
// reuses systemPrompt's task rules verbatim so the create and edit features can
// never disagree about valid task types or config fields.
const editSystemPrompt = `You revise existing FlowForge workflows in place.
You are given the current workflow definition and a requested change. Return the complete updated definition (not a diff or a fragment), preserving existing task ids, task types and configuration unless the requested change requires otherwise. Keep the dependency graph acyclic.

` + systemPrompt

// repairInstruction is appended after an invalid answer together with the
// validator's messages, asking the model to fix exactly those problems.
func repairInstruction(validationErrors []string) string {
	return "That answer was rejected for these reasons:\n- " +
		strings.Join(validationErrors, "\n- ") +
		"\nReturn the corrected workflow as a single JSON object and nothing else."
}
