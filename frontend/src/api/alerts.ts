import { api } from './client'
import type { AlertRuleResponse, AlertRuleCreate, AlertRuleUpdate, TriggeredAlert } from '@/types/api'

export const alertsApi = {
  listRules: () =>
    api.get<AlertRuleResponse[]>('/alert-rules').then((r) => r.data),

  getTriggered: () =>
    api.get<TriggeredAlert[]>('/alert-rules/triggered').then((r) => r.data),

  createRule: (data: AlertRuleCreate) =>
    api.post<AlertRuleResponse>('/alert-rules', data).then((r) => r.data),

  updateRule: (id: number, data: AlertRuleUpdate) =>
    api.patch<AlertRuleResponse>(`/alert-rules/${id}`, data).then((r) => r.data),

  deleteRule: (id: number) =>
    api.delete(`/alert-rules/${id}`),
}
