import { api } from './client'
import type { ProjectResponse, ProjectCreate, ProjectUpdate } from '@/types/api'

export const projectsApi = {
  list: () =>
    api.get<ProjectResponse[]>('/projects').then((r) => r.data),

  get: (id: number) =>
    api.get<ProjectResponse>(`/projects/${id}`).then((r) => r.data),

  create: (data: ProjectCreate) =>
    api.post<ProjectResponse>('/projects', data).then((r) => r.data),

  update: (id: number, data: ProjectUpdate) =>
    api.patch<ProjectResponse>(`/projects/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/projects/${id}`),
}
