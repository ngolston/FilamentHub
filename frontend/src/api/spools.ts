import { api } from './client'
import type {
  SpoolResponse,
  SpoolCreate,
  SpoolUpdate,
  SpoolFilters,
  PaginatedResponse,
  WeightLogResponse,
  WeightLogCreate,
} from '@/types/api'

export const spoolsApi = {
  list: (params?: SpoolFilters) =>
    api.get<PaginatedResponse<SpoolResponse>>('/spools', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<SpoolResponse>(`/spools/${id}`).then((r) => r.data),

  create: (data: SpoolCreate) =>
    api.post<SpoolResponse>('/spools', data).then((r) => r.data),

  update: (id: number, data: SpoolUpdate) =>
    api.patch<SpoolResponse>(`/spools/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/spools/${id}`),

  uploadPhoto: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<SpoolResponse>(`/spools/${id}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  logWeight: (id: number, data: WeightLogCreate) =>
    api.post<WeightLogResponse>(`/spools/${id}/weight-logs`, data).then((r) => r.data),

  getWeightLogs: (id: number) =>
    api.get<WeightLogResponse[]>(`/spools/${id}/weight-logs`).then((r) => r.data),
}
