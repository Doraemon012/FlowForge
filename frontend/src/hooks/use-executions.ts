import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createExecution,
  getExecution,
  listExecutionAttempts,
  listExecutions,
  listTaskRuns,
  type CreateExecutionInput,
} from '@/api/executions'
import type { Execution } from '@/api/types'

export const executionKeys = {
  all: ['executions'] as const,
  lists: () => [...executionKeys.all, 'list'] as const,
  list: (projectId: string) => [...executionKeys.lists(), projectId] as const,
  details: () => [...executionKeys.all, 'detail'] as const,
  detail: (executionId: string) => [...executionKeys.details(), executionId] as const,
  taskRuns: (executionId: string) =>
    [...executionKeys.detail(executionId), 'task-runs'] as const,
  attempts: (executionId: string) =>
    [...executionKeys.detail(executionId), 'attempts'] as const,
}

const ACTIVE_EXECUTION_STATUSES = new Set(['pending', 'running'])

export function isExecutionActive(status: string | undefined | null): boolean {
  return status != null && ACTIVE_EXECUTION_STATUSES.has(status)
}

export function useExecutions(projectId: string) {
  return useQuery({
    queryKey: executionKeys.list(projectId),
    queryFn: () => listExecutions(projectId),
    enabled: Boolean(projectId),
  })
}

export function useExecution(executionId: string) {
  return useQuery({
    queryKey: executionKeys.detail(executionId),
    queryFn: () => getExecution(executionId),
    enabled: Boolean(executionId),
    refetchInterval: (query) => (isExecutionActive(query.state.data?.status) ? 2000 : false),
  })
}

export function useTaskRuns(executionId: string) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: executionKeys.taskRuns(executionId),
    queryFn: () => listTaskRuns(executionId),
    enabled: Boolean(executionId),
    refetchInterval: () => {
      const execution = queryClient.getQueryData<Execution>(
        executionKeys.detail(executionId),
      )
      return isExecutionActive(execution?.status) ? 2000 : false
    },
  })
}

export function useExecutionAttempts(executionId: string) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: executionKeys.attempts(executionId),
    queryFn: () => listExecutionAttempts(executionId),
    enabled: Boolean(executionId),
    refetchInterval: () => {
      const execution = queryClient.getQueryData<Execution>(
        executionKeys.detail(executionId),
      )
      return isExecutionActive(execution?.status) ? 2000 : false
    },
  })
}

export function useCreateExecution(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateExecutionInput = {}) =>
      createExecution(projectId, workflowId, input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: executionKeys.list(projectId) })
      queryClient.setQueryData(executionKeys.detail(created.id), created)
    },
  })
}
