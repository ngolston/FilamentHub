import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download, Upload, FileText, FileJson, File,
  Database, CheckCircle2, Server, Clock, RefreshCw,
} from 'lucide-react'
import { dataApi } from '@/api/data'
import { adminApi } from '@/api/admin'
import type { ImportResult } from '@/types/api'
import { spoolsApi } from '@/api/spools'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { getErrorMessage } from '@/api/client'
import { exportInventoryPdf } from '@/utils/exportPdf'
import { SettingsCard } from './SettingsCard'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function DataBackupSection() {
  const csvRef      = useRef<HTMLInputElement>(null)
  const spoolmanRef = useRef<HTMLInputElement>(null)
  const user        = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [pdfError,     setPdfError]     = useState<string | null>(null)

  // Export mutations
  const csvMutation = useMutation({
    mutationFn: dataApi.exportCsv,
    onSuccess: (blob) => downloadBlob(blob, 'filamenthub_export.csv'),
  })

  const jsonMutation = useMutation({
    mutationFn: dataApi.exportJson,
    onSuccess: (blob) => downloadBlob(blob, 'filamenthub_export.json'),
  })

  const pdfMutation = useMutation({
    mutationFn: async () => {
      setPdfError(null)
      // Fetch all spools across pages (backend caps page_size at 200)
      const first = await spoolsApi.list({ page_size: 200, page: 1 })
      const items = [...first.items]
      for (let p = 2; p <= first.pages; p++) {
        const page = await spoolsApi.list({ page_size: 200, page: p })
        items.push(...page.items)
      }
      exportInventoryPdf(items, user?.display_name ?? user?.email)
    },
    onError: (err) => setPdfError(getErrorMessage(err)),
  })

  const serverBackupMutation = useMutation({
    mutationFn: dataApi.createServerBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['serverBackups'] }),
  })

  const syncProfilesMutation = useMutation({
    mutationFn: adminApi.syncFilamentProfiles,
  })

  const { data: serverBackups } = useQuery({
    queryKey: ['serverBackups'],
    queryFn: dataApi.listServerBackups,
  })

  // Import mutations
  const importMutation = useMutation({
    mutationFn: dataApi.importSpoolman,
    onSuccess: (data) => setImportResult(data),
  })

  const csvImportMutation = useMutation({
    mutationFn: dataApi.importCsv,
    onSuccess: (data) => setImportResult(data),
  })

  return (
    <div className="space-y-6">
      {/* Export */}
      <SettingsCard title="Export data" description="Download a copy of your inventory in your preferred format.">
        <div className="grid gap-3 sm:grid-cols-3">
          <ExportCard
            icon={<FileText className="h-5 w-5" />}
            label="CSV"
            description="Spreadsheet-compatible. Works with Excel, Google Sheets."
            loading={csvMutation.isPending}
            error={csvMutation.error ? getErrorMessage(csvMutation.error) : undefined}
            onClick={() => csvMutation.mutate()}
          />
          <ExportCard
            icon={<FileJson className="h-5 w-5" />}
            label="JSON"
            description="Spoolman-compatible backup. Import into any FilamentHub instance."
            loading={jsonMutation.isPending}
            error={jsonMutation.error ? getErrorMessage(jsonMutation.error) : undefined}
            onClick={() => jsonMutation.mutate()}
          />
          <ExportCard
            icon={<File className="h-5 w-5" />}
            label="PDF"
            description="Print-ready inventory report — one row per spool with fill %, status, and location."
            loading={pdfMutation.isPending}
            error={pdfError ?? undefined}
            onClick={() => pdfMutation.mutate()}
          />
        </div>
      </SettingsCard>

      {/* Import */}
      <SettingsCard title="Import data" description="Add spools from an existing inventory or migrate from another tool.">
        {importResult && (
          <div className="flex items-start gap-3 rounded-lg border border-green-700/40 bg-green-900/20 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-300">Import complete</p>
              <p className="text-xs text-green-400/80 mt-0.5">
                {importResult.imported} spool{importResult.imported !== 1 ? 's' : ''} imported
                {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
                {importResult.brands_created > 0 && ` · ${importResult.brands_created} brand${importResult.brands_created !== 1 ? 's' : ''} created`}
                {importResult.profiles_created > 0 && ` · ${importResult.profiles_created} filament profile${importResult.profiles_created !== 1 ? 's' : ''} created`}.
              </p>
            </div>
          </div>
        )}

        {importMutation.error && (
          <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
            {getErrorMessage(importMutation.error)}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <ImportCard
            icon={<FileText className="h-5 w-5" />}
            label="FilamentHub CSV"
            description="Re-import a previously exported CSV file."
            loading={csvImportMutation.isPending}
            onClick={() => csvRef.current?.click()}
          />
          <ImportCard
            icon={<Database className="h-5 w-5" />}
            label="Spoolman JSON"
            description="Import from a Spoolman backup file."
            loading={importMutation.isPending}
            onClick={() => spoolmanRef.current?.click()}
          />
          <ImportCard
            icon={<FileJson className="h-5 w-5" />}
            label="FilamentHub backup"
            description="Restore from a full FilamentHub JSON export."
            loading={importMutation.isPending}
            onClick={() => spoolmanRef.current?.click()}
          />
        </div>

        {/* Hidden file inputs */}
        <input
          ref={csvRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) { setImportResult(null); csvImportMutation.mutate(file) }
            e.target.value = ''
          }}
        />
        <input
          ref={spoolmanRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) { setImportResult(null); importMutation.mutate(file) }
            e.target.value = ''
          }}
        />
      </SettingsCard>

      {/* Sync filament profiles — admin only */}
      {user?.role === 'admin' && (
        <SettingsCard
          title="Sync filament profiles"
          description="Fetch the latest community filament profiles from 3DFilamentProfiles.com and update the local database."
        >
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => syncProfilesMutation.mutate()}
              loading={syncProfilesMutation.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Sync now
            </Button>
            {syncProfilesMutation.isSuccess && (
              <p className="text-xs text-green-400">Sync complete</p>
            )}
            {syncProfilesMutation.error && (
              <p className="text-xs text-red-400">{getErrorMessage(syncProfilesMutation.error)}</p>
            )}
          </div>
          {syncProfilesMutation.isSuccess && syncProfilesMutation.data?.output && (
            <pre className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-surface-3 px-3 py-2 text-[11px] text-gray-400 whitespace-pre-wrap">
              {syncProfilesMutation.data.output}
            </pre>
          )}
        </SettingsCard>
      )}

      {/* Auto-backup */}
      <SettingsCard
        title="Auto-backup"
        description="Full backups run automatically on the server every day at 12:01am."
      >
        {/* Schedule info */}
        <div className="flex items-start gap-3 rounded-lg border border-surface-border bg-surface-3 px-4 py-3 mb-4">
          <Clock className="h-4 w-4 text-primary-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">Daily at 12:01am (server time)</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Each backup is a ZIP archive containing the full database and all uploaded photos.
              Saved to <span className="font-mono text-gray-300">data/backups/</span> on the server.
              To restore: stop the app, extract the ZIP into your data directory, restart.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => serverBackupMutation.mutate()}
            loading={serverBackupMutation.isPending}
          >
            <Server className="h-3.5 w-3.5" /> Back up now
          </Button>
          {serverBackupMutation.isSuccess && (
            <p className="text-xs text-green-400">Backup saved successfully</p>
          )}
          {serverBackupMutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(serverBackupMutation.error)}</p>
          )}
        </div>

        {/* Saved server backups */}
        {serverBackups && serverBackups.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-400 mb-2">Saved backups ({serverBackups.length})</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {serverBackups.map((b) => (
                <BackupRow key={b.filename} backup={b} />
              ))}
            </div>
          </div>
        )}

        {serverBackups?.length === 0 && (
          <p className="mt-3 text-xs text-gray-500">No backups yet — the first one runs tonight at 12:01am, or click "Back up now".</p>
        )}
      </SettingsCard>
    </div>
  )
}

function BackupRow({ backup }: { backup: import('@/api/data').ServerBackupEntry }) {
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      const blob = await dataApi.downloadServerBackup(backup.filename)
      downloadBlob(blob, backup.filename)  // .zip file
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-3 px-3 py-2">
      <div>
        <p className="text-xs text-white font-mono">{backup.filename}</p>
        <p className="text-[10px] text-gray-500">
          {new Date(backup.created_at).toLocaleString()} · {(backup.size_bytes / 1024).toFixed(1)} KB
        </p>
      </div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="ml-3 text-gray-400 hover:text-white disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ExportCard({
  icon, label, description, loading, error, onClick, soon,
}: {
  icon: React.ReactNode
  label: string
  description: string
  loading?: boolean
  error?: string
  onClick?: () => void
  soon?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface-2 p-4">
      <div className="flex items-center gap-2 text-gray-300">
        {icon}
        <span className="text-sm font-semibold text-white">{label}</span>
        {soon && <span className="ml-auto rounded text-[9px] font-bold uppercase tracking-wide bg-surface-3 text-gray-400 px-1.5 py-0.5">Soon</span>}
      </div>
      <p className="text-xs text-gray-500 flex-1">{description}</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        loading={loading}
        disabled={soon}
      >
        <Download className="h-3.5 w-3.5" /> Export
      </Button>
    </div>
  )
}

function ImportCard({
  icon, label, description, loading, onClick, soon,
}: {
  icon: React.ReactNode
  label: string
  description: string
  loading?: boolean
  onClick?: () => void
  soon?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface-2 p-4">
      <div className="flex items-center gap-2 text-gray-300">
        {icon}
        <span className="text-sm font-semibold text-white">{label}</span>
        {soon && <span className="ml-auto rounded text-[9px] font-bold uppercase tracking-wide bg-surface-3 text-gray-400 px-1.5 py-0.5">Soon</span>}
      </div>
      <p className="text-xs text-gray-500 flex-1">{description}</p>
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        loading={loading}
        disabled={soon}
      >
        <Upload className="h-3.5 w-3.5" /> Import
      </Button>
    </div>
  )
}
