import { api } from './client'

// ── Bambu Cloud ───────────────────────────────────────────────────────────────

export interface BambuConfig {
  connected: boolean
  tfa_required?: boolean
  username: string | null
  printer_count: number
}

export interface BambuSyncResult {
  created: number
  updated: number
  unchanged: number
  total: number
}

// ── Home Assistant ────────────────────────────────────────────────────────────

export interface HaConfig {
  connected: boolean
  url: string | null
}

export interface HaSyncResult {
  pushed: number
  errors: number
  total: number
}

// ── API ───────────────────────────────────────────────────────────────────────

export const integrationsApi = {
  // Bambu
  getBambu: () =>
    api.get<BambuConfig>('/integrations/bambu').then((r) => r.data),

  connectBambu: (email: string, password: string) =>
    api.post<BambuConfig>('/integrations/bambu/connect', { email, password }).then((r) => r.data),

  verify2fa: (code: string) =>
    api.post<BambuConfig>('/integrations/bambu/verify-2fa', { code }).then((r) => r.data),

  disconnectBambu: () =>
    api.delete('/integrations/bambu'),

  syncBambu: () =>
    api.post<BambuSyncResult>('/integrations/bambu/sync').then((r) => r.data),

  // Home Assistant
  getHa: () =>
    api.get<HaConfig>('/integrations/home-assistant').then((r) => r.data),

  saveHa: (url: string, token: string) =>
    api.patch<HaConfig>('/integrations/home-assistant', { url, token }).then((r) => r.data),

  disconnectHa: () =>
    api.delete('/integrations/home-assistant'),

  testHa: () =>
    api.post<{ ok: boolean; ha_version: string; url: string }>('/integrations/home-assistant/test').then((r) => r.data),

  syncHa: () =>
    api.post<HaSyncResult>('/integrations/home-assistant/sync').then((r) => r.data),
}
