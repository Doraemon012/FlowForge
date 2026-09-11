import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSchedule,
  createWebhook,
  deleteSchedule,
  deleteWebhook,
  getSchedule,
  listWebhooks,
  setWebhookEnabled,
  updateSchedule,
  type ScheduleInput,
  type UpdateScheduleInput,
} from '@/api/triggers'

export const triggerKeys = {
  all: ['triggers'] as const,
  schedule: (projectId: string, workflowId: string) =>
    [...triggerKeys.all, 'schedule', projectId, workflowId] as const,
  webhooks: (projectId: string, workflowId: string) =>
    [...triggerKeys.all, 'webhooks', projectId, workflowId] as const,
}

export function useSchedule(projectId: string, workflowId: string) {
  return useQuery({
    queryKey: triggerKeys.schedule(projectId, workflowId),
    queryFn: () => getSchedule(projectId, workflowId),
    enabled: Boolean(projectId && workflowId),
  })
}

export function useCreateSchedule(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleInput) => createSchedule(projectId, workflowId, input),
    onSuccess: (schedule) => {
      queryClient.setQueryData(triggerKeys.schedule(projectId, workflowId), schedule)
    },
  })
}

export function useUpdateSchedule(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateScheduleInput) => updateSchedule(projectId, workflowId, input),
    onSuccess: (schedule) => {
      queryClient.setQueryData(triggerKeys.schedule(projectId, workflowId), schedule)
    },
  })
}

export function useDeleteSchedule(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteSchedule(projectId, workflowId),
    onSuccess: () => {
      queryClient.setQueryData(triggerKeys.schedule(projectId, workflowId), null)
    },
  })
}

export function useWebhooks(projectId: string, workflowId: string) {
  return useQuery({
    queryKey: triggerKeys.webhooks(projectId, workflowId),
    queryFn: () => listWebhooks(projectId, workflowId),
    enabled: Boolean(projectId && workflowId),
  })
}

export function useCreateWebhook(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (secret: string) => createWebhook(projectId, workflowId, secret),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.webhooks(projectId, workflowId) })
    },
  })
}

export function useSetWebhookEnabled(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ webhookId, enabled }: { webhookId: string; enabled: boolean }) =>
      setWebhookEnabled(projectId, workflowId, webhookId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.webhooks(projectId, workflowId) })
    },
  })
}

export function useDeleteWebhook(projectId: string, workflowId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (webhookId: string) => deleteWebhook(projectId, workflowId, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.webhooks(projectId, workflowId) })
    },
  })
}
