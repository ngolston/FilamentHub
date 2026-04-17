import { api } from './client'
import type { LocationResponse, LocationCreate } from '@/types/api'

export const locationsApi = {
  list: () =>
    api.get<LocationResponse[]>('/locations').then((r) => r.data),

  create: (data: LocationCreate) =>
    api.post<LocationResponse>('/locations', data).then((r) => r.data),

  update: (id: number, data: Partial<LocationCreate>) =>
    api.patch<LocationResponse>(`/locations/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/locations/${id}`),
}
