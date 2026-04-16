import { api } from './client'
import type { AlertRule, AlertRuleCreate } from '@/types/api'

export const alertsApi = {
  list: () =>
    api.get<AlertRule[]>('/alert-rules').then((r) => r.data),

  create: (data: AlertRuleCreate) =>
    api.post<AlertRule>('/alert-rules', data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/alert-rules/${id}`),
}
