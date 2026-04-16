import { api } from './client'
import type { UserResponse, UserUpdate, ApiKeyInfo, ApiKeySecret } from '@/types/api'

export const usersApi = {
  updateMe: (data: UserUpdate) =>
    api.patch<UserResponse>('/users/me', data).then((r) => r.data),

  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<UserResponse>('/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  listApiKeys: () =>
    api.get<ApiKeyInfo[]>('/users/me/api-keys').then((r) => r.data),

  createApiKey: (name: string, scopes?: string) =>
    api.post<ApiKeySecret>('/users/me/api-keys', { name, scopes }).then((r) => r.data),

  deleteApiKey: (keyId: string) =>
    api.delete(`/users/me/api-keys/${keyId}`),
}
