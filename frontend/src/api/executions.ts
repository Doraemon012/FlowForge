import { apiRequest } from './client'
import type { Execution, ExecutionEvent, ExecutionLog, TaskAttempt, TaskRun } from './types'

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

/**
 * Stop a pending or running execution. The server cancels any task runs that
 * have not started yet and returns the execution in its resulting state;
 * cancelling an already-finished execution is a no-op, so a retry is safe.
 */
export function cancelExecution(executionId: string) {
  return apiRequest<Execution>(`/api/v1/executions/${executionId}/cancel`, {
    method: 'POST',
  })
}

export function listTaskRuns(executionId: string) {
  return apiRequest<TaskRun[]>(`/api/v1/executions/${executionId}/tasks`)
}

export function listExecutionAttempts(executionId: string) {
  return apiRequest<TaskAttempt[]>(
    `/api/v1/executions/${executionId}/attempts`,
  )
}

export function listExecutionEvents(executionId: string) {
  return apiRequest<ExecutionEvent[]>(
    `/api/v1/executions/${executionId}/events`,
  )
}

export function listExecutionLogs(executionId: string) {
  return apiRequest<ExecutionLog[]>(
    `/api/v1/executions/${executionId}/logs`,
  )
}
