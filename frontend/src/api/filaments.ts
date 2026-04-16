import { api } from './client'
import type {
  FilamentProfileResponse,
  FilamentProfileCreate,
  FilamentProfileUpdate,
  FilamentFilters,
  PaginatedResponse,
} from '@/types/api'

export const filamentsApi = {
  list: (params?: FilamentFilters) =>
    api.get<PaginatedResponse<FilamentProfileResponse>>('/filaments', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<FilamentProfileResponse>(`/filaments/${id}`).then((r) => r.data),

  create: (data: FilamentProfileCreate) =>
    api.post<FilamentProfileResponse>('/filaments', data).then((r) => r.data),

  update: (id: number, data: FilamentProfileUpdate) =>
    api.patch<FilamentProfileResponse>(`/filaments/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/filaments/${id}`),
}
