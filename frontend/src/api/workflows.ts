import { apiRequest } from './client'
import type { ValidationResult, Workflow, WorkflowDefinition, WorkflowVersion } from './types'

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

export function validateWorkflow(projectId: string, workflowId: string) {
  return apiRequest<ValidationResult>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/validate`,
    {
      method: 'POST',
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
