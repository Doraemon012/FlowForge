import { apiRequest } from './client'
import type { Project } from './types'

export interface CreateProjectInput {
  name: string
}

export function listProjects() {
  return apiRequest<Project[]>('/api/v1/projects')
}

export function getProject(projectID: string) {
  return apiRequest<Project>(`/api/v1/projects/${projectID}`)
}

export function createProject(input: CreateProjectInput) {
  return apiRequest<Project>('/api/v1/projects', {
    method: 'POST',
    body: input,
  })
}

export function updateProject(projectID: string, input: CreateProjectInput) {
  return apiRequest<Project>(`/api/v1/projects/${projectID}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteProject(projectID: string) {
  return apiRequest<void>(`/api/v1/projects/${projectID}`, {
    method: 'DELETE',
  })
}

/**
 * Returns an archived project to service. Archiving is reversible: the project,
 * its workflows and its run history were only ever marked archived, so the
 * response is the project back in its active state and everything under it
 * works again exactly as before.
 */
export function restoreProject(projectID: string) {
  return apiRequest<Project>(`/api/v1/projects/${projectID}/restore`, {
    method: 'POST',
  })
}
