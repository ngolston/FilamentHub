import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, CheckCircle, XCircle, MinusCircle, ClipboardList,
  Printer as PrinterIcon, Package, Clock, Layers, Pencil, Trash2,
  Plus, X, AlertTriangle, FolderOpen,
} from 'lucide-react'
import { projectsApi } from '@/api/projects'
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

// ── Outcome config ─────────────────────────────────────────────────────────────

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

function formatDurationStr(seconds: number | null | undefined): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function parseDuration(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const parts = s.split(':').map(Number)
  if (parts.some((n) => isNaN(n) || n < 0)) return undefined
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 60
}

// ── Edit job modal ─────────────────────────────────────────────────────────────

const spoolRowSchema = z.object({
  spool_id:        z.coerce.number().positive('Select a spool'),
  filament_used_g: z.coerce.number().positive('Enter grams used'),
})

const jobSchema = z.object({
  file_name:    z.string().optional(),
  plate_number: z.coerce.number().int().min(1).optional().or(z.literal('')),
  printed_date: z.string().optional(),
  duration_str: z.string().optional(),
  outcome:      z.enum(['success', 'failed', 'cancelled']),
  printer_id:   z.coerce.number().optional(),
  spools:       z.array(spoolRowSchema),
  notes:        z.string().optional(),
})
type JobForm = z.infer<typeof jobSchema>

function EditJobModal({ job, onClose }: { job: PrintJobResponse; onClose: () => void }) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [newPhotos, setNewPhotos] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])

  const today = new Date().toISOString().slice(0, 10)

  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.list,
  })

  const { data: spoolsPage } = useQuery({
    queryKey: ['spools', 'active-storage'],
    queryFn: () => spoolsApi.list({ status: 'active,storage', page_size: 200 }),
  })
  const spools = spoolsPage?.items ?? []

  const defaultSpools = job.spools.length > 0
    ? job.spools.map((s) => ({
        spool_id: s.spool_id ?? 0,
        filament_used_g: s.filament_used_g,
      }))
    : []

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      file_name:    job.file_name ?? '',
      plate_number: job.plate_number ?? ('' as any),
      printed_date: job.finished_at ? job.finished_at.slice(0, 10) : today,
      duration_str: formatDurationStr(job.duration_seconds),
      outcome:      (job.outcome as PrintJobOutcome) ?? 'success',
      printer_id:   job.printer?.id ?? ('' as any),
      spools:       defaultSpools,
      notes:        job.notes ?? '',
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'spools' })
  const watchedSpools = watch('spools')
  const totalG = watchedSpools.reduce((sum, s) => sum + (Number(s.filament_used_g) || 0), 0)

  const mutation = useMutation({
    mutationFn: async (d: JobForm) => {
      const durationSecs = d.duration_str ? parseDuration(d.duration_str) : undefined

      let finished_at: string | undefined
      if (d.printed_date) {
        finished_at = new Date(`${d.printed_date}T12:00:00Z`).toISOString()
      }

      const updated = await printJobsApi.update(job.id, {
        printer_id:       Number(d.printer_id) || undefined,
        spools:           d.spools.map((s) => ({
          spool_id:        Number(s.spool_id),
          filament_used_g: Number(s.filament_used_g),
        })),
        plate_number:     Number(d.plate_number) || null,
        file_name:        d.file_name || null,
        duration_seconds: durationSecs ?? null,
        outcome:          d.outcome,
        notes:            d.notes || null,
        finished_at,
      })

      if (newPhotos.length > 0) {
        await printJobsApi.uploadPhotos(updated.id, newPhotos)
      }

      return updated
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-jobs'] })
      qc.invalidateQueries({ queryKey: ['spools'] })
      onClose()
    },
    onError: (err) => setServerError(getErrorMessage(err)),
  })

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (!selected.length) return
    setNewPhotos((prev) => [...prev, ...selected])
    setNewPreviews((prev) => [...prev, ...selected.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeNewPhoto(i: number) {
    URL.revokeObjectURL(newPreviews[i])
    setNewPhotos((prev) => prev.filter((_, idx) => idx !== i))
    setNewPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const selectCls = 'w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface-1 shadow-2xl flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4 shrink-0">
          <h2 className="text-base font-semibold text-white">Edit print job</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="overflow-y-auto">
          <div className="space-y-4 p-5">

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Input label="File name" placeholder="benchy.3mf" {...register('file_name')} />
              </div>
              <Input label="Plate #" type="number" min="1" placeholder="1" {...register('plate_number')} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Date printed</label>
              <input type="date" max={today} className={selectCls} {...register('printed_date')} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">
                Duration <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <Input placeholder="h:mm:ss" {...register('duration_str')} />
            </div>

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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">
                Printer <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <select {...register('printer_id')} className={selectCls}>
                <option value="">— None —</option>
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">
                  Spools <span className="text-gray-500 font-normal">(deducts weight)</span>
                </label>
                {totalG > 0 && (
                  <span className="text-xs text-gray-500">
                    Total: <span className="text-white font-medium">{totalG.toFixed(2)}g</span>
                  </span>
                )}
              </div>

              {fields.map((field, i) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <select
                      {...register(`spools.${i}.spool_id`)}
                      className={cn(selectCls, errors.spools?.[i]?.spool_id && 'border-red-500')}
                    >
                      <option value="">— Select spool —</option>
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
                  <div className="w-24 shrink-0">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="g used"
                      error={errors.spools?.[i]?.filament_used_g?.message}
                      {...register(`spools.${i}.filament_used_g`)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="mt-1.5 rounded-lg p-2 text-gray-500 hover:bg-surface-3 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => append({ spool_id: 0, filament_used_g: 0 })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-surface-border py-2 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add spool
              </button>
            </div>

            {/* Existing photos */}
            {job.photos.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Existing photos</label>
                <div className="grid grid-cols-4 gap-2">
                  {job.photos.map((src, i) => (
                    <div key={i} className="aspect-square">
                      <img src={src} alt="" className="h-full w-full rounded-lg object-cover border border-surface-border" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New photos */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Add photos <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              {newPreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {newPreviews.map((src, i) => (
                    <div key={i} className="relative group aspect-square">
                      <img src={src} alt="" className="h-full w-full rounded-lg object-cover border border-surface-border" />
                      <button
                        type="button"
                        onClick={() => removeNewPhoto(i)}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-surface-border py-2.5 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {newPreviews.length === 0 ? 'Add photos' : 'Add more'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            </div>

            <Input label="Notes" placeholder="Optional notes…" {...register('notes')} />

            {serverError && <p className="text-sm text-red-400">{serverError}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-4 shrink-0">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Save changes</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete confirm ─────────────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel, loading }: {
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
      <span className="text-xs text-red-300">Delete this job?</span>
      <div className="ml-auto flex gap-1.5">
        <button
          onClick={onCancel}
          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

// ── Job card ───────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: PrintJobResponse }) {
  const qc = useQueryClient()
  const [showEdit,   setShowEdit]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => printJobsApi.delete(job.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-jobs'] })
      qc.invalidateQueries({ queryKey: ['spools'] })
    },
  })

  const date = job.finished_at ? new Date(job.finished_at) : null

  const spoolLabel = job.spools.length > 0
    ? job.spools.map((s) => s.spool?.name ?? `Spool #${s.spool_id}`).join(', ')
    : job.spool
      ? (job.spool.name ?? `Spool #${job.spool.id}`)
      : null

  const title = job.file_name
    ?? (job.plate_number != null ? `Plate ${job.plate_number}` : null)

  return (
    <>
      <div className="rounded-xl border border-surface-border bg-surface-1 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            job.outcome === 'success'   ? 'bg-green-900/40 text-green-400' :
            job.outcome === 'failed'    ? 'bg-red-900/40 text-red-400'     :
                                          'bg-yellow-900/40 text-yellow-400',
          )}>
            {OUTCOME_CONFIG[job.outcome as PrintJobOutcome]?.icon ?? <ClipboardList className="h-4 w-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">
              {title ?? <span className="italic text-gray-500">Unnamed job</span>}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
              {job.printer && (
                <span className="flex items-center gap-1">
                  <PrinterIcon className="h-3 w-3" />
                  {job.printer.name}
                </span>
              )}
              {spoolLabel && (
                <span className="flex items-center gap-1 truncate max-w-[200px]">
                  <Package className="h-3 w-3 shrink-0" />
                  {spoolLabel}
                </span>
              )}
              {job.filament_used_g != null && (
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {job.filament_used_g}g
                </span>
              )}
              {job.duration_seconds && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(job.duration_seconds)}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <OutcomeBadge outcome={job.outcome as PrintJobOutcome} />
            {date && (
              <span className="text-[10px] text-gray-600" title={format(date, 'PPpp')}>
                {formatDistanceToNow(date, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        {job.notes && (
          <p className="text-xs text-gray-500 border-t border-surface-border pt-2">{job.notes}</p>
        )}

        {job.photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-surface-border pt-2">
            {job.photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover border border-surface-border"
              />
            ))}
          </div>
        )}

        {showDelete ? (
          <DeleteConfirm
            loading={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
            onCancel={() => setShowDelete(false)}
          />
        ) : (
          <div className="flex items-center gap-2 border-t border-surface-border pt-3">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-surface-2 hover:text-white transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-red-950/30 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {showEdit && <EditJobModal job={job} onClose={() => setShowEdit(false)} />}
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectsApi.get(projectId),
  })

  const { data: jobsPage, isLoading: jobsLoading } = useQuery({
    queryKey: ['print-jobs', { project_id: projectId }],
    queryFn: () => printJobsApi.list({ project_id: projectId, page_size: 200 }),
    staleTime: 0,
  })

  const jobs = jobsPage?.items ?? []

  const totalG = jobs.reduce((s, j) => s + (j.filament_used_g ?? 0), 0)
  const successCount = jobs.filter((j) => j.outcome === 'success').length

  if (projectLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-start gap-4">
        <Link
          to="/print-jobs"
          className="mt-0.5 rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary-400" />
            {project?.name ?? 'Project'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
            {project?.created_at && ` · Created ${format(new Date(project.created_at), 'MMM d, yyyy')}`}
          </p>
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-1 px-4 py-2.5">
            <ClipboardList className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold text-white tabular-nums">{jobs.length}</span>
            <span className="text-sm text-gray-500">total jobs</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-1 px-4 py-2.5">
            <Layers className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold text-white tabular-nums">
              {totalG > 1000 ? `${(totalG / 1000).toFixed(2)}kg` : `${Math.round(totalG)}g`}
            </span>
            <span className="text-sm text-gray-500">filament used</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-1 px-4 py-2.5">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold text-white tabular-nums">{successCount}</span>
            <span className="text-sm text-gray-500">successful</span>
          </div>
        </div>
      )}

      {jobsLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-border bg-surface-1 py-14 text-center">
          <ClipboardList className="h-8 w-8 text-gray-600" />
          <div>
            <p className="text-sm font-medium text-gray-300">No jobs in this project yet</p>
            <p className="mt-0.5 text-xs text-gray-500">Log a job and assign it to this project.</p>
          </div>
          <Link to="/print-jobs">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Print Jobs
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => <JobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  )
}
