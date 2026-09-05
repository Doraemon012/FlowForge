import { apiRequest } from './client'
import type { Execution, TaskAttempt, TaskRun } from './types'

export interface CreateExecutionInput {
  version_id?: string
  input?: Record<string, unknown>
}

export function createExecution(
  projectId: string,
  workflowId: string,
  input: CreateExecutionInput = {},
) {
  return apiRequest<Execution>(
    `/api/v1/projects/${projectId}/workflows/${workflowId}/executions`,
    {
      method: 'POST',
      body: input,
    },
  )
}

export function listExecutions(projectId: string) {
  return apiRequest<Execution[]>(`/api/v1/projects/${projectId}/executions`)
}

export function getExecution(executionId: string) {
  return apiRequest<Execution>(`/api/v1/executions/${executionId}`)
}

export function listTaskRuns(executionId: string) {
  return apiRequest<TaskRun[]>(`/api/v1/executions/${executionId}/tasks`)
}

export function listExecutionAttempts(executionId: string) {
  return apiRequest<TaskAttempt[]>(
    `/api/v1/executions/${executionId}/attempts`,
  )
}
