import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, ClipboardList, CheckCircle, XCircle, MinusCircle,
  Printer as PrinterIcon, Package, Clock, Layers, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { printJobsApi } from '@/api/print-jobs'
import { printersApi } from '@/api/printers'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/utils/cn'
import { getErrorMessage } from '@/api/client'
import { formatDistanceToNow, format } from 'date-fns'
import type { PrintJobResponse, PrintJobOutcome } from '@/types/api'

// ── Outcome helpers ────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<PrintJobOutcome, {
  label: string
  icon: React.ReactNode
  badge: 'success' | 'danger' | 'warning'
}> = {
  success:   { label: 'Success',   icon: <CheckCircle  className="h-3.5 w-3.5" />, badge: 'success' },
  failed:    { label: 'Failed',    icon: <XCircle      className="h-3.5 w-3.5" />, badge: 'danger'  },
  cancelled: { label: 'Cancelled', icon: <MinusCircle  className="h-3.5 w-3.5" />, badge: 'warning' },
}

function OutcomeBadge({ outcome }: { outcome: PrintJobOutcome }) {
  const cfg = OUTCOME_CONFIG[outcome]
  return (
    <Badge variant={cfg.badge} className="flex items-center gap-1">
      {cfg.icon}
      {cfg.label}
    </Badge>
  )
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Job row ────────────────────────────────────────────────────────────────────

function JobRow({ job }: { job: PrintJobResponse }) {
  const date = job.finished_at ? new Date(job.finished_at) : null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-1 px-4 py-3 hover:bg-surface-2 transition-colors">
      {/* Outcome icon */}
      <div className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        job.outcome === 'success'   ? 'bg-green-900/40 text-green-400' :
        job.outcome === 'failed'    ? 'bg-red-900/40 text-red-400'     :
                                      'bg-yellow-900/40 text-yellow-400',
      )}>
        {OUTCOME_CONFIG[job.outcome as PrintJobOutcome]?.icon ?? <ClipboardList className="h-4 w-4" />}
      </div>

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {job.file_name || <span className="text-gray-500 italic">Unnamed job</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          {job.printer && (
            <span className="flex items-center gap-1">
              <PrinterIcon className="h-3 w-3" />
              {job.printer.name}
            </span>
          )}
          {job.spool && (
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {job.spool.name ?? `Spool #${job.spool.id}`}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex shrink-0 items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1" title="Filament used">
          <Layers className="h-3.5 w-3.5" />
          {job.filament_used_g}g
        </span>
        <span className="flex items-center gap-1" title="Duration">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(job.duration_seconds)}
        </span>
      </div>

      {/* Outcome + date */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <OutcomeBadge outcome={job.outcome as PrintJobOutcome} />
        {date && (
          <span className="text-[10px] text-gray-600" title={format(date, 'PPpp')}>
            {formatDistanceToNow(date, { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Log job modal ──────────────────────────────────────────────────────────────

const jobSchema = z.object({
  file_name:        z.string().optional(),
  filament_used_g:  z.coerce.number().positive('Required — enter grams used'),
  duration_minutes: z.coerce.number().min(0).optional(),
  outcome:          z.enum(['success', 'failed', 'cancelled']),
  printer_id:       z.coerce.number().optional(),
  spool_id:         z.coerce.number().optional(),
  notes:            z.string().optional(),
})
type JobForm = z.infer<typeof jobSchema>

function LogJobModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: printersApi.list })
  const { data: spoolsPage } = useQuery({
    queryKey: ['spools', 'active-storage'],
    queryFn: () => spoolsApi.list({ status: 'active,storage', page_size: 200 }),
  })
  const spools = spoolsPage?.items ?? []

  const { register, handleSubmit, formState: { errors } } = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: { outcome: 'success' },
  })

  const mutation = useMutation({
    mutationFn: (d: JobForm) => printJobsApi.create({
      file_name:        d.file_name || undefined,
      filament_used_g:  d.filament_used_g,
      duration_seconds: d.duration_minutes ? Math.round(d.duration_minutes * 60) : undefined,
      outcome:          d.outcome,
      printer_id:       d.printer_id || undefined,
      spool_id:         d.spool_id || undefined,
      notes:            d.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-jobs'] })
      qc.invalidateQueries({ queryKey: ['spools'] })
      onClose()
    },
    onError: (err) => setServerError(getErrorMessage(err)),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 className="text-base font-semibold text-white">Log print job</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 p-5">
          <Input
            label="File name"
            placeholder="benchy.3mf"
            {...register('file_name')}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Filament used (g)"
              type="number"
              step="0.1"
              placeholder="12.5"
              error={errors.filament_used_g?.message}
              {...register('filament_used_g')}
            />
            <Input
              label="Duration (minutes)"
              type="number"
              placeholder="90"
              {...register('duration_minutes')}
            />
          </div>

          {/* Outcome */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Outcome</label>
            <div className="flex gap-2">
              {(['success', 'failed', 'cancelled'] as const).map((o) => (
                <label key={o} className="flex-1">
                  <input type="radio" value={o} {...register('outcome')} className="sr-only peer" />
                  <div className={cn(
                    'cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium text-center transition-colors',
                    'peer-checked:border-primary-500 peer-checked:bg-primary-600/20 peer-checked:text-primary-300',
                    'border-surface-border text-gray-500 hover:border-gray-600 hover:text-gray-300',
                  )}>
                    {OUTCOME_CONFIG[o].label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Printer */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Printer <span className="text-gray-500 font-normal">(optional)</span></label>
            <select
              {...register('printer_id')}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">— None —</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Spool */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Spool <span className="text-gray-500 font-normal">(optional — deducts weight)</span></label>
            <select
              {...register('spool_id')}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">— None —</option>
              {spools.map((s) => {
                const label = s.name ?? s.filament?.name ?? `Spool #${s.id}`
                const mat   = s.filament?.material ?? ''
                return (
                  <option key={s.id} value={s.id}>
                    {label}{mat ? ` · ${mat}` : ''} ({Math.round(s.remaining_weight)}g left)
                  </option>
                )
              })}
            </select>
          </div>

          <Input
            label="Notes"
            placeholder="Optional notes…"
            {...register('notes')}
          />

          {serverError && (
            <p className="text-sm text-red-400">{serverError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Log job</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const OUTCOMES: { value: string; label: string }[] = [
  { value: '',          label: 'All outcomes' },
  { value: 'success',   label: 'Success'      },
  { value: 'failed',    label: 'Failed'       },
  { value: 'cancelled', label: 'Cancelled'    },
]

export default function PrintJobsPage() {
  const [showModal,      setShowModal]      = useState(false)
  const [outcomeFilter,  setOutcomeFilter]  = useState('')
  const [page,           setPage]           = useState(1)
  const PAGE_SIZE = 20

  const { data, isLoading } = useQuery({
    queryKey: ['print-jobs', { outcome: outcomeFilter, page }],
    queryFn: () => printJobsApi.list({
      outcome:   (outcomeFilter as PrintJobOutcome) || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
  })

  const jobs  = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  // Quick stats from current full result set
  const successRate = total === 0 ? null : (
    jobs.filter((j) => j.outcome === 'success').length / jobs.length * 100
  )
  const totalGrams = jobs.reduce((s, j) => s + j.filament_used_g, 0)

  return (
    <div className="p-5 lg:p-7 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Print Jobs</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Track filament consumption and print outcomes across all your printers.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Log job
        </Button>
      </div>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-1 px-4 py-2.5">
          <ClipboardList className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-white tabular-nums">{total}</span>
          <span className="text-sm text-gray-500">total jobs</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-1 px-4 py-2.5">
          <Layers className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-white tabular-nums">
            {totalGrams > 1000 ? `${(totalGrams / 1000).toFixed(2)}kg` : `${Math.round(totalGrams)}g`}
          </span>
          <span className="text-sm text-gray-500">filament used</span>
        </div>
        {successRate !== null && (
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5',
            successRate >= 80 ? 'border-green-700/40 bg-green-950/20' : 'border-amber-700/40 bg-amber-950/20',
          )}>
            <CheckCircle className={cn('h-4 w-4', successRate >= 80 ? 'text-green-400' : 'text-amber-400')} />
            <span className={cn('text-sm font-semibold tabular-nums', successRate >= 80 ? 'text-green-300' : 'text-amber-300')}>
              {Math.round(successRate)}%
            </span>
            <span className="text-sm text-gray-500">success rate</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            onClick={() => { setOutcomeFilter(o.value); setPage(1) }}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              outcomeFilter === o.value
                ? 'border-primary-500 bg-primary-600/20 text-primary-300'
                : 'border-surface-border text-gray-500 hover:border-gray-600 hover:text-gray-300',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Job list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-border bg-surface-1 py-14 text-center">
          <ClipboardList className="h-8 w-8 text-gray-600" />
          <div>
            <p className="text-sm font-medium text-gray-300">No print jobs yet</p>
            <p className="mt-0.5 text-xs text-gray-500">Log a job to start tracking filament usage.</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Log first job
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => <JobRow key={job.id} job={job} />)}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-500">
            Page {page} of {pages} · {total} jobs
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-surface-border p-1.5 text-gray-500 hover:bg-surface-2 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="rounded-lg border border-surface-border p-1.5 text-gray-500 hover:bg-surface-2 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {showModal && <LogJobModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
