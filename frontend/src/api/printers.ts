import { api } from './client'
import type { PrinterResponse, PrinterCreate, PrinterUpdate, AmsUnit } from '@/types/api'

export const printersApi = {
  list: () =>
    api.get<PrinterResponse[]>('/printers').then((r) => r.data),

  get: (id: number) =>
    api.get<PrinterResponse>(`/printers/${id}`).then((r) => r.data),

  create: (data: PrinterCreate) =>
    api.post<PrinterResponse>('/printers', data).then((r) => r.data),

  update: (id: number, data: PrinterUpdate) =>
    api.patch<PrinterResponse>(`/printers/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/printers/${id}`),

  addAmsUnit: (printerId: number) =>
    api.post<AmsUnit>(`/printers/${printerId}/ams`).then((r) => r.data),

  assignAmsSlot: (printerId: number, unitId: number, slotIndex: number, spoolId: number | null) =>
    api
      .patch(`/printers/${printerId}/ams/${unitId}/slots/${slotIndex}`, null, { params: { spool_id: spoolId } })
      .then((r) => r.data),

  assignDirectSpool: (printerId: number, spoolId: number | null) =>
    api
      .patch<PrinterResponse>(`/printers/${printerId}/direct-spool`, null, { params: { spool_id: spoolId } })
      .then((r) => r.data),
}
