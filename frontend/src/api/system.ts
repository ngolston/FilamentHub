import axios from 'axios'
import { api } from './client'

export interface SmtpConfig {
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_from: string | null
  smtp_tls: boolean
  configured: boolean
}

export interface SmtpConfigPatch {
  smtp_host?: string | null
  smtp_port?: number | null
  smtp_user?: string | null
  smtp_password?: string | null
  smtp_from?: string | null
  smtp_tls?: boolean
}

export interface PublicConfig {
  allow_registration: boolean
}

// Base URL for unauthenticated requests (before the user has a token)
const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export const systemApi = {
  // No auth — safe to call from the login page
  getPublicConfig: () =>
    axios.get<PublicConfig>(`${BASE}/system/config`).then((r) => r.data),

  setAllowRegistration: (allow_registration: boolean) =>
    api.patch<PublicConfig>('/system/config', { allow_registration }).then((r) => r.data),

  getSmtp: () =>
    api.get<SmtpConfig>('/system/smtp').then((r) => r.data),

  updateSmtp: (data: SmtpConfigPatch) =>
    api.patch<SmtpConfig>('/system/smtp', data).then((r) => r.data),

  testSmtp: () =>
    api.post<{ ok: boolean; sent_to: string }>('/system/smtp/test').then((r) => r.data),
}
