import { ApiError, apiRequest } from './client'
import type { CreatedWebhook, Schedule, Webhook } from './types'

function schedulePath(projectId: string, workflowId: string) {
  return `/api/v1/projects/${projectId}/workflows/${workflowId}/schedules`
}

function webhooksPath(projectId: string, workflowId: string) {
  return `/api/v1/projects/${projectId}/workflows/${workflowId}/webhooks`
}

export interface ScheduleInput {
  cron_expression: string
  timezone: string
  enabled?: boolean
}

export interface UpdateScheduleInput {
  cron_expression: string
  timezone: string
  enabled: boolean
}

/**
 * A workflow has at most one schedule. The API reports "none yet" as a 404, so
 * that specific status is translated to `null` rather than surfaced as an
 * error the user would have to interpret.
 */
export async function getSchedule(projectId: string, workflowId: string): Promise<Schedule | null> {
  try {
    return await apiRequest<Schedule>(schedulePath(projectId, workflowId))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export function createSchedule(projectId: string, workflowId: string, input: ScheduleInput) {
  return apiRequest<Schedule>(schedulePath(projectId, workflowId), {
    method: 'POST',
    body: { cron_expression: input.cron_expression, timezone: input.timezone },
  })
}

export function updateSchedule(projectId: string, workflowId: string, input: UpdateScheduleInput) {
  return apiRequest<Schedule>(schedulePath(projectId, workflowId), {
    method: 'PATCH',
    body: input,
  })
}

export function deleteSchedule(projectId: string, workflowId: string) {
  return apiRequest<void>(schedulePath(projectId, workflowId), { method: 'DELETE' })
}

export function listWebhooks(projectId: string, workflowId: string) {
  return apiRequest<Webhook[]>(webhooksPath(projectId, workflowId))
}

export function createWebhook(projectId: string, workflowId: string, secret: string) {
  return apiRequest<CreatedWebhook>(webhooksPath(projectId, workflowId), {
    method: 'POST',
    body: { secret },
  })
}

export function setWebhookEnabled(
  projectId: string,
  workflowId: string,
  webhookId: string,
  enabled: boolean,
) {
  return apiRequest<void>(`${webhooksPath(projectId, workflowId)}/${webhookId}`, {
    method: 'PATCH',
    body: { enabled },
  })
}

export function deleteWebhook(projectId: string, workflowId: string, webhookId: string) {
  return apiRequest<void>(`${webhooksPath(projectId, workflowId)}/${webhookId}`, {
    method: 'DELETE',
  })
}
