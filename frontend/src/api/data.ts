import { api } from './client'
import type { ImportResult } from '@/types/api'

function uploadFile<T>(endpoint: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return api
    .post<T>(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data)
}

export interface ServerBackupEntry {
  filename: string
  size_bytes: number
  created_at: string
}

export const dataApi = {
  importSpoolman: (file: File) =>
    uploadFile<ImportResult>('/data/import/spoolman', file),

  importCsv: (file: File) =>
    uploadFile<ImportResult>('/data/import/csv', file),

  exportCsv: () =>
    api.get('/data/export/csv', { responseType: 'blob' }).then((r) => r.data as Blob),

  exportJson: () =>
    api.get('/data/export/json', { responseType: 'blob' }).then((r) => r.data as Blob),

  createServerBackup: () =>
    api.post<{ filename: string; size_bytes: number }>('/data/backup').then((r) => r.data),

  listServerBackups: () =>
    api.get<{ backups: ServerBackupEntry[] }>('/data/backups').then((r) => r.data.backups),

  downloadServerBackup: (filename: string) =>
    api
      .get(`/data/backups/${encodeURIComponent(filename)}`, { responseType: 'blob' })
      .then((r) => r.data as Blob),
}
