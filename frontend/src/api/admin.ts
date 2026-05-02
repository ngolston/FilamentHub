import { api } from './client'
import type { UserResponse } from '@/types/api'

export const adminApi = {
  listUsers: () =>
    api.get<UserResponse[]>('/admin/users').then((r) => r.data),

  pendingCount: () =>
    api.get<{ count: number }>('/admin/users/pending/count').then((r) => r.data),

  updateUser: (userId: string, data: { role?: string; is_approved?: boolean; is_active?: boolean }) =>
    api.patch<UserResponse>(`/admin/users/${userId}`, data).then((r) => r.data),

  deleteUser: (userId: string) =>
    api.delete(`/admin/users/${userId}`),
}
