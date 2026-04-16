import { api } from './client'
import type { UsageSummary, SpoolForecast } from '@/types/api'

export const analyticsApi = {
  summary: (days = 30) =>
    api.get<UsageSummary>('/analytics/summary', { params: { days } }).then((r) => r.data),

  forecast: () =>
    api.get<SpoolForecast[]>('/analytics/forecast').then((r) => r.data),
}
