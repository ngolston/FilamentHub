import { api } from './client'
import type {
  UserRegister,
  UserLogin,
  TokenResponse,
  UserResponse,
  TotpSetupResponse,
} from '@/types/api'

export const authApi = {
  register: (data: UserRegister) =>
    api.post<UserResponse>('/auth/register', data).then((r) => r.data),

  login: (data: UserLogin) =>
    api.post<TokenResponse>('/auth/login', data).then((r) => r.data),

  refresh: (refreshToken: string) =>
    api.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data),

  me: () => api.get<UserResponse>('/auth/me').then((r) => r.data),

  totpSetup: () =>
    api.post<TotpSetupResponse>('/auth/totp/setup').then((r) => r.data),

  totpEnable: (code: string) =>
    api.post<{ message: string }>('/auth/totp/enable', { code }).then((r) => r.data),

  totpDisable: (code: string) =>
    api.post<{ message: string }>('/auth/totp/disable', { code }).then((r) => r.data),
}
