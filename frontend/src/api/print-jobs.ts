import { api } from './client'
import type {
  PrintJobResponse,
  PrintJobCreate,
  PrintJobFilters,
  PaginatedResponse,
} from '@/types/api'

export const printJobsApi = {
  list: (params?: PrintJobFilters) =>
    api.get<PaginatedResponse<PrintJobResponse>>('/print-jobs', { params }).then((r) => r.data),

  create: (data: PrintJobCreate) =>
    api.post<PrintJobResponse>('/print-jobs', data).then((r) => r.data),
}
