import { api } from './client'
import type { BrandResponse, BrandCreate, BrandUpdate } from '@/types/api'

export const brandsApi = {
  list: (search?: string) =>
    api.get<BrandResponse[]>('/brands', { params: search ? { search } : undefined }).then((r) => r.data),

  get: (id: number) =>
    api.get<BrandResponse>(`/brands/${id}`).then((r) => r.data),

  create: (data: BrandCreate) =>
    api.post<BrandResponse>('/brands', data).then((r) => r.data),

  update: (id: number, data: BrandUpdate) =>
    api.patch<BrandResponse>(`/brands/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/brands/${id}`),
}
