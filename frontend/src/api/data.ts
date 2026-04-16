import { api } from './client'
import type { ImportResult } from '@/types/api'

export const dataApi = {
  importSpoolman: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<ImportResult>('/data/import/spoolman', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  exportCsv: () =>
    api.get('/data/export/csv', { responseType: 'blob' }).then((r) => r.data as Blob),

  exportJson: () =>
    api.get('/data/export/json', { responseType: 'blob' }).then((r) => r.data as Blob),
}
