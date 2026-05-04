import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getStoredGeneralPrefs } from '@/hooks/useGeneralPrefs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, ClipboardList, CheckCircle, XCircle, MinusCircle,
  Printer as PrinterIcon, Package, Clock, Layers, X, ChevronLeft, ChevronRight,
  Trash2, ImagePlus, FolderPlus, FolderOpen, ArrowLeft,
} from 'lucide-react'
import { printJobsApi } from '@/api/print-jobs'
import { projectsApi } from '@/api/projects'
import { printersApi } from '@/api/printers'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/utils/cn'
import { getErrorMessage } from '@/api/client'
import { formatDistanceToNow, format } from 'date-fns'
import type { PrintJobResponse, PrintJobOutcome, ProjectResponse } from '@/types/api'

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

  const title = job.project
    ? job.project.name + (job.plate_number != null ? ` — Plate ${job.plate_number}` : '')
    : job.file_name ?? null

  const spoolLabel = job.spools.length > 0
    ? job.spools.map((s) => s.spool?.name ?? `Spool #${s.spool_id}`).join(', ')
    : job.spool
      ? (job.spool.name ?? `Spool #${job.spool.id}`)
      : null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-1 px-4 py-3 hover:bg-surface-2 transition-colors">
      <div className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        job.outcome === 'success'   ? 'bg-green-900/40 text-green-400' :
        job.outcome === 'failed'    ? 'bg-red-900/40 text-red-400'     :
                                      'bg-yellow-900/40 text-yellow-400',
      )}>
        {OUTCOME_CONFIG[job.outcome as PrintJobOutcome]?.icon ?? <ClipboardList className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {title
            ? title
            : <span className="text-gray-500 italic">Unnamed job</span>
          }
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          {job.printer && (
            <span className="flex items-center gap-1">
              <PrinterIcon className="h-3 w-3" />
              {job.printer.name}
            </span>
          )}
          {spoolLabel && (
            <span className="flex items-center gap-1 truncate max-w-[160px]">
              <Package className="h-3 w-3 shrink-0" />
              {spoolLabel}
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:flex shrink-0 items-center gap-4 text-xs text-gray-500">
        {job.filament_used_g != null && (
          <span className="flex items-center gap-1" title="Filament used">
            <Layers className="h-3.5 w-3.5" />
            {job.filament_used_g}g
          </span>
        )}
        <span className="flex items-center gap-1" title="Duration">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(job.duration_seconds)}
        </span>
      </div>

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

// ── Create project modal ───────────────────────────────────────────────────────

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName]         = useState('')
  const [error, setError]       = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => projectsApi.create({ name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 className="text-base font-semibold text-white">Create a new project</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <Input
            label="Project name"
            placeholder="e.g. Gridfinity shelf"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && mutation.mutate()}
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              type="button"
              disabled={!name.trim()}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Create project
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Log job modal ──────────────────────────────────────────────────────────────

type ModalStep = 'ask' | 'pick' | 'form'

const spoolRowSchema = z.object({
  spool_id:        z.coerce.number().positive('Select a spool'),
  filament_used_g: z.coerce.number().positive('Enter grams used'),
})

// Accepts "h:mm:ss", "mm:ss", or a bare number (treated as minutes).
function parseDuration(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const parts = s.split(':').map(Number)
  if (parts.some((n) => isNaN(n) || n < 0)) return undefined
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60  + parts[1]
  return parts[0] * 60
}

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

function LogJobModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [step, setStep]                     = useState<ModalStep>('ask')
  const [isProjectJob, setIsProjectJob]     = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectResponse | null>(null)
  const [serverError, setServerError]       = useState<string | null>(null)
  const [photos, setPhotos]                 = useState<File[]>([])
  const [previews, setPreviews]             = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    staleTime: 0,
  })

  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.list,
    enabled: step === 'form',
  })

  const { data: spoolsPage } = useQuery({
    queryKey: ['spools', 'active-storage'],
    queryFn: () => spoolsApi.list({ status: 'active,storage', page_size: 200 }),
    enabled: step === 'form',
  })
  const spools = spoolsPage?.items ?? []

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: { outcome: 'success', printed_date: today, spools: [] },
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

      const job = await printJobsApi.create({
        printer_id:       Number(d.printer_id) || undefined,
        project_id:       selectedProject?.id,
        spools:           d.spools.map((s) => ({
          spool_id:        Number(s.spool_id),
          filament_used_g: Number(s.filament_used_g),
        })),
        plate_number:     Number(d.plate_number) || undefined,
        file_name:        isProjectJob ? undefined : (d.file_name || undefined),
        duration_seconds: durationSecs,
        outcome:          d.outcome,
        notes:            d.notes || undefined,
        finished_at,
      })

      if (photos.length > 0) {
        await printJobsApi.uploadPhotos(job.id, photos)
      }

      return job
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
    setPhotos((prev) => [...prev, ...selected])
    setPreviews((prev) => [...prev, ...selected.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(previews[i])
    setPhotos((prev) => prev.filter((_, idx) => idx !== i))
    setPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const selectCls = 'w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

  // ── Step: ask ──────────────────────────────────────────────────────────────

  if (step === 'ask') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 shadow-2xl">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <h2 className="text-base font-semibold text-white">Log print job</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-400">Is this print part of a project?</p>
            <button
              onClick={() => { setIsProjectJob(true); setStep('pick') }}
              className="flex w-full items-center gap-4 rounded-xl border border-surface-border bg-surface-2 px-4 py-4 text-left hover:border-primary-500/60 hover:bg-surface-3 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600/20 text-primary-400">
                <FolderOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Yes, add to a project</p>
                <p className="text-xs text-gray-500 mt-0.5">Part of a multi-plate or ongoing build</p>
              </div>
            </button>
            <button
              onClick={() => { setIsProjectJob(false); setStep('form') }}
              className="flex w-full items-center gap-4 rounded-xl border border-surface-border bg-surface-2 px-4 py-4 text-left hover:border-gray-600 hover:bg-surface-3 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-gray-400">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">No, single print</p>
                <p className="text-xs text-gray-500 mt-0.5">One-off print not tied to a project</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step: pick project ─────────────────────────────────────────────────────

  if (step === 'pick') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 shadow-2xl flex flex-col max-h-[80vh]">
          <div className="flex items-center gap-2 border-b border-surface-border px-5 py-4 shrink-0">
            <button
              onClick={() => setStep('ask')}
              className="rounded-lg p-1 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-semibold text-white flex-1">Choose a project</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-5 space-y-2">
            {projectsLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <FolderOpen className="h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-400">No projects yet.</p>
                <p className="text-xs text-gray-500">Create one using the "Create a new Project" button on the main page.</p>
              </div>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProject(p); setStep('form') }}
                  className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-2 px-4 py-3 text-left hover:border-primary-500/60 hover:bg-surface-3 transition-colors"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary-400" />
                  <span className="text-sm font-medium text-white">{p.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Step: form ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface-1 shadow-2xl flex flex-col max-h-[92vh]">

        <div className="flex items-center gap-2 border-b border-surface-border px-5 py-4 shrink-0">
          <button
            onClick={() => setStep(isProjectJob ? 'pick' : 'ask')}
            className="rounded-lg p-1 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white">Log print job</h2>
            {selectedProject && (
              <p className="text-xs text-primary-400 truncate">{selectedProject.name}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="overflow-y-auto">
          <div className="space-y-4 p-5">

            {/* File name + Plate # — file name hidden for project jobs */}
            <div className={cn('grid gap-3', isProjectJob ? 'grid-cols-1' : 'grid-cols-3')}>
              {!isProjectJob && (
                <div className="col-span-2">
                  <Input
                    label="File name"
                    placeholder="benchy.3mf"
                    {...register('file_name')}
                  />
                </div>
              )}
              <Input
                label="Plate #"
                type="number"
                min="1"
                placeholder="1"
                {...register('plate_number')}
              />
            </div>

            {/* Date printed */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Date printed</label>
              <input
                type="date"
                max={today}
                className={selectCls}
                {...register('printed_date')}
              />
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">
                Duration <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <Input placeholder="h:mm:ss" {...register('duration_str')} />
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

            {/* Spools */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">
                  Spools <span className="text-gray-500 font-normal">(optional — deducts weight)</span>
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
                    {errors.spools?.[i]?.spool_id && (
                      <p className="mt-0.5 text-xs text-red-400">{errors.spools[i]?.spool_id?.message}</p>
                    )}
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

            {/* Photos */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Photos <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              {previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group aspect-square">
                      <img src={src} alt="" className="h-full w-full rounded-lg object-cover border border-surface-border" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
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
                <ImagePlus className="h-3.5 w-3.5" />
                {previews.length === 0 ? 'Add photos' : 'Add more'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            </div>

            {/* Notes */}
            <Input label="Notes" placeholder="Optional notes…" {...register('notes')} />

            {serverError && <p className="text-sm text-red-400">{serverError}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-4 shrink-0">
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
  const [showLogModal,     setShowLogModal]     = useState(false)
  const [showCreateModal,  setShowCreateModal]  = useState(false)
  const [outcomeFilter,    setOutcomeFilter]    = useState('')
  const [page,             setPage]             = useState(1)
  const PAGE_SIZE = getStoredGeneralPrefs().page_size

  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    staleTime: 0,
  })

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

  const successRate = total === 0 ? null : (
    jobs.filter((j) => j.outcome === 'success').length / jobs.length * 100
  )
  const totalGrams = jobs.reduce((s, j) => s + (j.filament_used_g ?? 0), 0)

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
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setShowCreateModal(true)}>
            <FolderPlus className="h-4 w-4 mr-1.5" />
            Create a new Project
          </Button>
          <Button onClick={() => setShowLogModal(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Log job
          </Button>
        </div>
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

      {/* Projects */}
      {projectsData.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Projects</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projectsData.map((p) => (
              <Link
                key={p.id}
                to={`/print-jobs/projects/${p.id}`}
                className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-1 px-4 py-3 hover:border-primary-500/50 hover:bg-surface-2 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600/20 text-primary-400">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    Created {format(new Date(p.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

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
          <Button onClick={() => setShowLogModal(true)}>
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

      {showLogModal    && <LogJobModal        onClose={() => setShowLogModal(false)} />}
      {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
    </div>
  )
}
