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
