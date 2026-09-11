import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkflowDefinition } from '@/api/types'
import { trialUsageKey } from '@/hooks/use-trial'
import {
  activateWorkflowVersion,
  createWorkflow,
  deactivateWorkflow,
  editWorkflow,
  generateWorkflow,
  getAiStatus,
  getWorkflow,
  getWorkflowVersion,
  listVersions,
  listWorkflows,
  publishWorkflow,
  updateWorkflow,
  validateWorkflow,
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
} from '@/api/workflows'

export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (projectId: string) => [...workflowKeys.lists(), projectId] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (projectId: string, workflowId: string) =>
    [...workflowKeys.details(), projectId, workflowId] as const,
  versions: (projectId: string, workflowId: string) =>
    [...workflowKeys.detail(projectId, workflowId), 'versions'] as const,
  version: (projectId: string, workflowId: string, versionId: string) =>
    [...workflowKeys.versions(projectId, workflowId), versionId] as const,
}

export function useWorkflows(projectId: string) {
  return useQuery({
    queryKey: workflowKeys.list(projectId),
    queryFn: () => listWorkflows(projectId),
    enabled: Boolean(projectId),
  })
}

export function useWorkflow(projectId: string, workflowId: string) {
  return useQuery({
    queryKey: workflowKeys.detail(projectId, workflowId),
    queryFn: () => getWorkflow(projectId, workflowId),
    enabled: Boolean(projectId && workflowId),
  })
}

export function useCreateWorkflow(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWorkflowInput) => createWorkflow(projectId, input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.list(projectId) })
      queryClient.setQueryData(workflowKeys.detail(projectId, created.id), created)
    },
  })
}

export function useUpdateWorkflow(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateWorkflowInput) => updateWorkflow(projectId, workflowId, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.list(projectId) })
      queryClient.setQueryData(workflowKeys.detail(projectId, updated.id), updated)
    },
  })
}

export function useValidateWorkflow(projectId: string, workflowId: string) {
  // Validation never persists: it checks the definition it is given (or the
  // stored draft when no definition is passed) so the builder can validate
  // unsaved changes without clearing its unsaved state.
  return useMutation({
    mutationFn: (definition?: WorkflowDefinition) =>
      validateWorkflow(projectId, workflowId, definition),
  })
}

export function usePublishWorkflow(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => publishWorkflow(projectId, workflowId),
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(projectId, workflowId) })
      queryClient.invalidateQueries({ queryKey: workflowKeys.versions(projectId, workflowId) })
      queryClient.setQueryData(
        workflowKeys.version(projectId, workflowId, version.id),
        version,
      )
    },
  })
}

export function useListVersions(projectId: string, workflowId: string) {
  return useQuery({
    queryKey: workflowKeys.versions(projectId, workflowId),
    queryFn: () => listVersions(projectId, workflowId),
    enabled: Boolean(projectId && workflowId),
  })
}

export function useWorkflowVersion(
  projectId: string,
  workflowId: string,
  versionId: string,
) {
  return useQuery({
    queryKey: workflowKeys.version(projectId, workflowId, versionId),
    queryFn: () => getWorkflowVersion(projectId, workflowId, versionId),
    enabled: Boolean(projectId && workflowId && versionId),
  })
}

export function useActivateWorkflowVersion(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (versionId: string) =>
      activateWorkflowVersion(projectId, workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(projectId, workflowId) })
      queryClient.invalidateQueries({ queryKey: workflowKeys.versions(projectId, workflowId) })
      queryClient.invalidateQueries({ queryKey: workflowKeys.list(projectId) })
    },
  })
}

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: getAiStatus,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useGenerateWorkflow(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (prompt: string) => generateWorkflow(projectId, workflowId, prompt),
    // A generation always consumes trial AI quota (or is refused), so the
    // cached counter is refreshed either way to keep the indicator honest.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trialUsageKey })
    },
  })
}

export function useEditWorkflow(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { instruction: string; definition: WorkflowDefinition }) =>
      editWorkflow(projectId, workflowId, input.instruction, input.definition),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trialUsageKey })
    },
  })
}

export function useDeactivateWorkflow(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (versionId: string) =>
      deactivateWorkflow(projectId, workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(projectId, workflowId) })
      queryClient.invalidateQueries({ queryKey: workflowKeys.versions(projectId, workflowId) })
      queryClient.invalidateQueries({ queryKey: workflowKeys.list(projectId) })
    },
  })
}
