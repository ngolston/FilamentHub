import { api } from './client'
import type {
  UserRegister,
  UserLogin,
  TokenResponse,
  UserResponse,
  TotpSetupResponse,
  SessionResponse,
} from '@/types/api'

export const authApi = {
  register: (data: UserRegister) =>
    api.post<UserResponse>('/auth/register', data).then((r) => r.data),

  login: (data: UserLogin) =>
    api.post<TokenResponse>('/auth/login', data).then((r) => r.data),

  refresh: (refreshToken: string) =>
    api.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data),

  me: () => api.get<UserResponse>('/auth/me').then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, new_password: newPassword }),

  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', null, { params: { token } }),

  resendVerification: () =>
    api.post('/auth/resend-verification'),

  listSessions: () =>
    api.get<SessionResponse[]>('/auth/sessions').then((r) => r.data),

  revokeSession: (sessionId: number) =>
    api.delete(`/auth/sessions/${sessionId}`),

  revokeAllSessions: () =>
    api.delete('/auth/sessions'),

  totpSetup: () =>
    api.post<TotpSetupResponse>('/auth/totp/setup').then((r) => r.data),

  totpEnable: (code: string) =>
    api.post<{ message: string }>('/auth/totp/enable', { code }).then((r) => r.data),

  totpDisable: (code: string) =>
    api.post<{ message: string }>('/auth/totp/disable', { code }).then((r) => r.data),
}
