import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Download, Upload, FileText, FileJson, File,
  Database, CheckCircle2,
} from 'lucide-react'
import { dataApi } from '@/api/data'
import { useLocalSetting } from '@/hooks/useLocalSetting'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { getErrorMessage } from '@/api/client'
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
  const csvRef       = useRef<HTMLInputElement>(null)
  const spoolmanRef  = useRef<HTMLInputElement>(null)

  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  const [autoBackup,  setAutoBackup]  = useLocalSetting('fh_auto_backup',  false)
  const [backupFreq,  setBackupFreq]  = useLocalSetting('fh_backup_freq',  'weekly')
  const [backupDest,  setBackupDest]  = useLocalSetting('fh_backup_dest',  'browser')

  // Export mutations
  const csvMutation = useMutation({
    mutationFn: dataApi.exportCsv,
    onSuccess: (blob) => downloadBlob(blob, 'filamenthub_export.csv'),
  })

  const jsonMutation = useMutation({
    mutationFn: dataApi.exportJson,
    onSuccess: (blob) => downloadBlob(blob, 'filamenthub_export.json'),
  })

  // Import mutation
  const importMutation = useMutation({
    mutationFn: dataApi.importSpoolman,
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
            description="Print-ready inventory report with QR labels."
            soon
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
                {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}.
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
            description="Previously exported CSV file."
            soon
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
            description="Restore from a full FilamentHub export."
            soon
          />
        </div>

        {/* Hidden file inputs */}
        <input ref={csvRef}      type="file" accept=".csv"  className="hidden" />
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

      {/* Auto-backup */}
      <SettingsCard title="Auto-backup" description="Automatically export and save your inventory on a schedule.">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-white">Enable auto-backup</p>
            <p className="text-xs text-gray-500 mt-0.5">Runs in the background based on the schedule below.</p>
          </div>
          <Toggle checked={autoBackup} onChange={setAutoBackup} />
        </div>

        {autoBackup && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Frequency</label>
              <select
                value={backupFreq}
                onChange={(e) => setBackupFreq(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Destination</label>
              <select
                value={backupDest}
                onChange={(e) => setBackupDest(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
              >
                <option value="browser">Browser download</option>
                <option value="google_drive" disabled>Google Drive (coming soon)</option>
                <option value="dropbox"      disabled>Dropbox (coming soon)</option>
              </select>
            </div>
          </div>
        )}
      </SettingsCard>
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
