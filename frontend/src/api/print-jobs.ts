import { api } from './client'
import type {
  PrintJobResponse,
  PrintJobCreate,
  PrintJobUpdate,
  PrintJobFilters,
  PaginatedResponse,
} from '@/types/api'

export const printJobsApi = {
  list: (params?: PrintJobFilters) =>
    api.get<PaginatedResponse<PrintJobResponse>>('/print-jobs', { params }).then((r) => r.data),

  create: (data: PrintJobCreate) =>
    api.post<PrintJobResponse>('/print-jobs', data).then((r) => r.data),

  update: (id: number, data: PrintJobUpdate) =>
    api.put<PrintJobResponse>(`/print-jobs/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/print-jobs/${id}`),

  uploadPhotos: (jobId: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return api.post<PrintJobResponse>(`/print-jobs/${jobId}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}
