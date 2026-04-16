import { api } from './client'
import type { DryingSessionResponse, DryingSessionCreate } from '@/types/api'

export const dryingApi = {
  start: (spoolId: number, data: DryingSessionCreate) =>
    api.post<DryingSessionResponse>(`/drying-sessions/spools/${spoolId}/dry`, data).then((r) => r.data),

  finish: (sessionId: number, humidityAfter?: number) =>
    api
      .patch<DryingSessionResponse>(`/drying-sessions/${sessionId}/finish`, {
        humidity_after: humidityAfter,
      })
      .then((r) => r.data),

  getForSpool: (spoolId: number) =>
    api.get<DryingSessionResponse[]>(`/drying-sessions/spools/${spoolId}`).then((r) => r.data),
}
