import { api } from './client'
import type { WebhookCreate, WebhookResponse, WebhookUpdate } from '@/types/api'

export const webhooksApi = {
  list: () =>
    api.get<WebhookResponse[]>('/webhooks').then((r) => r.data),

  create: (data: WebhookCreate) =>
    api.post<WebhookResponse>('/webhooks', data).then((r) => r.data),

  update: (id: number, data: WebhookUpdate) =>
    api.patch<WebhookResponse>(`/webhooks/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/webhooks/${id}`),

  test: (id: number) =>
    api.post<{ status_code: number; success: boolean }>(`/webhooks/${id}/test`).then((r) => r.data),
}
