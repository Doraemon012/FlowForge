import { apiRequest } from './client'
import type {
  ValidationResult,
  Workflow,
  WorkflowDefinition,
  WorkflowReviewWarning,
  WorkflowVersion,
} from './types'

/**
 * A definition produced by AI assistance, together with the advisory review
 * warnings for it. The server always validates the definition before returning
 * it, so `definition` is safe to apply; `warnings` are patterns that passed
 * validation but still deserve a human look before running.
 */
export interface AiDefinitionResult {
  definition: WorkflowDefinition
  warnings: WorkflowReviewWarning[]
}

export interface CreateWorkflowInput {
  name: string
  description?: string
  definition?: WorkflowDefinition
}

export interface UpdateWorkflowInput {
  name: string
  description?: string
  definition: WorkflowDefinition
}

export function listWorkflows(projectId: string) {
  return apiRequest<Workflow[]>(`/api/v1/projects/${projectId}/workflows`)
}

export function createWorkflow(projectId: string, input: CreateWorkflowInput) {
  return apiRequest<Workflow>(`/api/v1/projects/${projectId}/workflows`, {
    method: 'POST',
    body: input,
  })
}

export function getWorkflow(projectId: string, workflowId: string) {
  return apiRequest<Workflow>(`/api/v1/projects/${projectId}/workflows/${workflowId}`)
}

export function updateWorkflow(projectId: string, workflowId: string, input: UpdateWorkflowInput) {
  return apiRequest<Workflow>(`/api/v1/projects/${projectId}/workflows/${workflowId}`, {
    method: 'PATCH',
    body: input,
  })
}

/**
 * Validate a workflow. When `definition` is provided the server validates that
 * definition without persisting it, so the builder can check unsaved changes.
 */
export function validateWorkflow(
  projectId: string,
  workflowId: string,
  definition?: WorkflowDefinition,
) {
  return apiRequest<ValidationResult>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/validate`,
    {
      method: 'POST',
      body: definition ? { definition } : undefined,
    },
  )
}

export function publishWorkflow(projectId: string, workflowId: string) {
  return apiRequest<WorkflowVersion>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/versions`,
    {
      method: 'POST',
    },
  )
}

export function listVersions(projectId: string, workflowId: string) {
  return apiRequest<WorkflowVersion[]>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/versions`,
  )
}

export function getWorkflowVersion(projectId: string, workflowId: string, versionId: string) {
  return apiRequest<WorkflowVersion>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/versions/${versionId}`,
  )
}

export function activateWorkflowVersion(
  projectId: string,
  workflowId: string,
  versionId: string,
) {
  return apiRequest<void>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/versions/${versionId}/activate`,
    {
      method: 'POST',
    },
  )
}

export function deactivateWorkflow(
  projectId: string,
  workflowId: string,
  versionId: string,
) {
  return apiRequest<void>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/versions/${versionId}/deactivate`,
    {
      method: 'POST',
    },
  )
}

export function getAiStatus() {
  return apiRequest<{ enabled: boolean }>('/api/v1/ai/status')
}

/**
 * Ask FlowForge's AI assistance to turn a natural-language description into a
 * workflow definition. The server validates the result before returning it, so
 * a successful response is always a definition that passes validation.
 */
export function generateWorkflow(projectId: string, workflowId: string, prompt: string) {
  return apiRequest<AiDefinitionResult>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/generate`,
    {
      method: 'POST',
      body: { prompt },
    },
  )
}

/**
 * Ask FlowForge's AI assistance to revise an existing workflow from a
 * natural-language instruction. The current definition is sent so the model
 * edits what the builder shows (including unsaved changes); the server
 * validates the result before returning it, exactly like generation.
 */
export function editWorkflow(
  projectId: string,
  workflowId: string,
  instruction: string,
  definition: WorkflowDefinition,
) {
  return apiRequest<AiDefinitionResult>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/edit`,
    {
      method: 'POST',
      body: { instruction, definition },
    },
  )
}
