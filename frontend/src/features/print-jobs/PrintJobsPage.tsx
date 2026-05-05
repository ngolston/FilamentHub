import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, ClipboardList, CheckCircle, XCircle, MinusCircle, Search,
  Printer as PrinterIcon, Package, Clock, Layers, X,
  Trash2, ImagePlus, FolderPlus, FolderOpen, ArrowLeft,
  List, LayoutGrid, ChevronRight, ChevronDown, ChevronUp,
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
import { JobDetailModal, formatDuration } from './JobDetailModal'

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

// ── Sort key ───────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'outcome' | 'filament' | 'duration'

// ── Create project modal ───────────────────────────────────────────────────────

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName]   = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => projectsApi.create({ name: name.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
    onError:   (err) => setError(getErrorMessage(err)),
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
            <Button type="button" disabled={!name.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>
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
  const [step, setStep]                       = useState<ModalStep>('ask')
  const [isProjectJob, setIsProjectJob]       = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectResponse | null>(null)
  const [serverError, setServerError]         = useState<string | null>(null)
  const [photos, setPhotos]                   = useState<File[]>([])
  const [previews, setPreviews]               = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'], queryFn: projectsApi.list, staleTime: 0,
  })
  const { data: printers = [] } = useQuery({
    queryKey: ['printers'], queryFn: printersApi.list, enabled: step === 'form',
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
      const finished_at  = d.printed_date ? new Date(`${d.printed_date}T12:00:00Z`).toISOString() : undefined
      const job = await printJobsApi.create({
        printer_id:       Number(d.printer_id) || undefined,
        project_id:       selectedProject?.id,
        spools:           d.spools.map((s) => ({ spool_id: Number(s.spool_id), filament_used_g: Number(s.filament_used_g) })),
        plate_number:     Number(d.plate_number) || undefined,
        file_name:        isProjectJob ? undefined : (d.file_name || undefined),
        duration_seconds: durationSecs,
        outcome:          d.outcome,
        notes:            d.notes || undefined,
        finished_at,
      })
      if (photos.length > 0) await printJobsApi.uploadPhotos(job.id, photos)
      return job
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['print-jobs'] }); qc.invalidateQueries({ queryKey: ['spools'] }); onClose() },
    onError:   (err) => setServerError(getErrorMessage(err)),
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

  if (step === 'ask') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 className="text-base font-semibold text-white">Log print job</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-400">Is this print part of a project?</p>
          <button onClick={() => { setIsProjectJob(true); setStep('pick') }} className="flex w-full items-center gap-4 rounded-xl border border-surface-border bg-surface-2 px-4 py-4 text-left hover:border-primary-500/60 hover:bg-surface-3 transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600/20 text-primary-400"><FolderOpen className="h-5 w-5" /></div>
            <div><p className="text-sm font-medium text-white">Yes, add to a project</p><p className="text-xs text-gray-500 mt-0.5">Part of a multi-plate or ongoing build</p></div>
          </button>
          <button onClick={() => { setIsProjectJob(false); setStep('form') }} className="flex w-full items-center gap-4 rounded-xl border border-surface-border bg-surface-2 px-4 py-4 text-left hover:border-gray-600 hover:bg-surface-3 transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-gray-400"><ClipboardList className="h-5 w-5" /></div>
            <div><p className="text-sm font-medium text-white">No, single print</p><p className="text-xs text-gray-500 mt-0.5">One-off print not tied to a project</p></div>
          </button>
        </div>
      </div>
    </div>
  )

  if (step === 'pick') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center gap-2 border-b border-surface-border px-5 py-4 shrink-0">
          <button onClick={() => setStep('ask')} className="rounded-lg p-1 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"><ArrowLeft className="h-4 w-4" /></button>
          <h2 className="text-base font-semibold text-white flex-1">Choose a project</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-2">
          {projectsLoading ? <div className="flex justify-center py-8"><Spinner /></div>
          : projects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <FolderOpen className="h-8 w-8 text-gray-600" />
              <p className="text-sm text-gray-400">No projects yet.</p>
              <p className="text-xs text-gray-500">Create one using the "Create a new Project" button.</p>
            </div>
          ) : projects.map((p) => (
            <button key={p.id} onClick={() => { setSelectedProject(p); setStep('form') }}
              className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-2 px-4 py-3 text-left hover:border-primary-500/60 hover:bg-surface-3 transition-colors">
              <FolderOpen className="h-4 w-4 shrink-0 text-primary-400" />
              <span className="text-sm font-medium text-white">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface-1 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center gap-2 border-b border-surface-border px-5 py-4 shrink-0">
          <button onClick={() => setStep(isProjectJob ? 'pick' : 'ask')} className="rounded-lg p-1 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"><ArrowLeft className="h-4 w-4" /></button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white">Log print job</h2>
            {selectedProject && <p className="text-xs text-primary-400 truncate">{selectedProject.name}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="overflow-y-auto">
          <div className="space-y-4 p-5">
            <div className={cn('grid gap-3', isProjectJob ? 'grid-cols-1' : 'grid-cols-3')}>
              {!isProjectJob && (
                <div className="col-span-2">
                  <Input label="File name" placeholder="benchy.3mf" {...register('file_name')} />
                </div>
              )}
              <Input label="Plate #" type="number" min="1" placeholder="1" {...register('plate_number')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Date printed</label>
              <input type="date" max={today} className={selectCls} {...register('printed_date')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Duration <span className="text-gray-500 font-normal">(optional)</span></label>
              <Input placeholder="h:mm:ss" {...register('duration_str')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Outcome</label>
              <div className="flex gap-2">
                {(['success', 'failed', 'cancelled'] as const).map((o) => (
                  <label key={o} className="flex-1">
                    <input type="radio" value={o} {...register('outcome')} className="sr-only peer" />
                    <div className={cn('cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium text-center transition-colors',
                      'peer-checked:border-primary-500 peer-checked:bg-primary-600/20 peer-checked:text-primary-300',
                      'border-surface-border text-gray-500 hover:border-gray-600 hover:text-gray-300')}>
                      {OUTCOME_CONFIG[o].label}
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Printer <span className="text-gray-500 font-normal">(optional)</span></label>
              <select {...register('printer_id')} className={selectCls}>
                <option value="">— None —</option>
                {printers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">Spools <span className="text-gray-500 font-normal">(optional — deducts weight)</span></label>
                {totalG > 0 && <span className="text-xs text-gray-500">Total: <span className="text-white font-medium">{totalG.toFixed(2)}g</span></span>}
              </div>
              {fields.map((field, i) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <select {...register(`spools.${i}.spool_id`)} className={cn(selectCls, errors.spools?.[i]?.spool_id && 'border-red-500')}>
                      <option value="">— Select spool —</option>
                      {spools.map((s) => {
                        const label = s.name ?? s.filament?.name ?? `Spool #${s.id}`
                        const mat   = s.filament?.material ?? ''
                        return <option key={s.id} value={s.id}>{label}{mat ? ` · ${mat}` : ''} ({Math.round(s.remaining_weight)}g left)</option>
                      })}
                    </select>
                    {errors.spools?.[i]?.spool_id && <p className="mt-0.5 text-xs text-red-400">{errors.spools[i]?.spool_id?.message}</p>}
                  </div>
                  <div className="w-24 shrink-0">
                    <Input type="number" step="0.01" min="0.01" placeholder="g used"
                      error={errors.spools?.[i]?.filament_used_g?.message}
                      {...register(`spools.${i}.filament_used_g`)} />
                  </div>
                  <button type="button" onClick={() => remove(i)} className="mt-1.5 rounded-lg p-2 text-gray-500 hover:bg-surface-3 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => append({ spool_id: 0, filament_used_g: 0 })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-surface-border py-2 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors">
                <Plus className="h-3.5 w-3.5" />Add spool
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Photos <span className="text-gray-500 font-normal">(optional)</span></label>
              {previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group aspect-square">
                      <img src={src} alt="" className="h-full w-full rounded-lg object-cover border border-surface-border" />
                      <button type="button" onClick={() => removePhoto(i)}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-surface-border py-2.5 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors">
                <ImagePlus className="h-3.5 w-3.5" />
                {previews.length === 0 ? 'Add photos' : 'Add more'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            </div>
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

// ── Sort header cell ───────────────────────────────────────────────────────────

function SortTh({ col, label, sortBy, sortDir, onSort, className }: {
  col: SortKey; label: string; sortBy: SortKey; sortDir: 'asc' | 'desc'
  onSort: (c: SortKey) => void; className?: string
}) {
  const active = sortBy === col
  return (
    <th
      onClick={() => onSort(col)}
      className={cn('cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-white transition-colors', className)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc'
            ? <ChevronUp className="h-3 w-3 text-primary-400" />
            : <ChevronDown className="h-3 w-3 text-primary-400" />
          : <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
      </span>
    </th>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const left  = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  const pages: (number | '…')[] = [1]
  if (left > 2)          pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

const PAGE_SIZE = 20

export default function PrintJobsPage() {
  const [view,          setView]          = useState<'table' | 'grid'>('table')
  const [search,        setSearch]        = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [printerFilter, setPrinterFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [sortBy,        setSortBy]        = useState<SortKey>('date')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc')
  const [page,          setPage]          = useState(1)
  const [viewJob,       setViewJob]       = useState<PrintJobResponse | null>(null)
  const [showLogModal,     setShowLogModal]     = useState(false)
  const [showCreateModal,  setShowCreateModal]  = useState(false)

  // ── Data ───────────────────────────────────────────────────────────────────

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['print-jobs', 'all'],
    queryFn:  () => printJobsApi.list({ page_size: 200 }),
    staleTime: 0,
  })
  const allJobs = jobsData?.items ?? []

  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    staleTime: 0,
  })

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:     allJobs.length,
    success:   allJobs.filter((j) => j.outcome === 'success').length,
    failed:    allJobs.filter((j) => j.outcome === 'failed').length,
    cancelled: allJobs.filter((j) => j.outcome === 'cancelled').length,
    totalG:    allJobs.reduce((s, j) => s + (j.filament_used_g ?? 0), 0),
  }), [allJobs])

  // ── Derived filter options ─────────────────────────────────────────────────

  const printerOptions = useMemo(() => {
    const map = new Map<number, string>()
    allJobs.forEach((j) => { if (j.printer) map.set(j.printer.id, j.printer.name) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [allJobs])

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let r = allJobs
    if (search) {
      const q = search.toLowerCase()
      r = r.filter((j) =>
        (j.file_name ?? '').toLowerCase().includes(q) ||
        (j.project?.name ?? '').toLowerCase().includes(q) ||
        (j.printer?.name ?? '').toLowerCase().includes(q) ||
        (j.notes ?? '').toLowerCase().includes(q) ||
        j.spools.some((s) => (s.spool?.name ?? '').toLowerCase().includes(q))
      )
    }
    if (outcomeFilter) r = r.filter((j) => j.outcome === outcomeFilter)
    if (printerFilter) r = r.filter((j) => j.printer && String(j.printer.id) === printerFilter)
    if (projectFilter) r = r.filter((j) => j.project && String(j.project.id) === projectFilter)
    return r
  }, [allJobs, search, outcomeFilter, printerFilter, projectFilter])

  // ── Sorting ────────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortBy) {
        case 'outcome':  av = a.outcome; bv = b.outcome; break
        case 'filament': av = a.filament_used_g ?? -1; bv = b.filament_used_g ?? -1; break
        case 'duration': av = a.duration_seconds ?? -1; bv = b.duration_seconds ?? -1; break
        default:         av = a.finished_at; bv = b.finished_at
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [filtered, sortBy, sortDir])

  // ── Pagination ─────────────────────────────────────────────────────────────

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage  = Math.min(page, pageCount)
  const paged     = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleSort(col: SortKey) {
    if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const hasFilters = !!(search || outcomeFilter || printerFilter || projectFilter)

  function clearFilters() {
    setSearch(''); setOutcomeFilter(''); setPrinterFilter(''); setProjectFilter('')
  }

  const filterSelectCls = 'rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none'

  // ── Job title helper ───────────────────────────────────────────────────────

  function jobTitle(job: PrintJobResponse): string | null {
    if (job.project) return job.project.name + (job.plate_number != null ? ` — Plate ${job.plate_number}` : '')
    return job.file_name ?? null
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Print Jobs</h2>
          <p className="mt-0.5 text-sm text-gray-400">Track filament consumption and print outcomes.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setShowCreateModal(true)}>
            <FolderPlus className="h-4 w-4" />
            New project
          </Button>
          <Button onClick={() => setShowLogModal(true)}>
            <Plus className="h-4 w-4" />
            Log job
          </Button>
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { label: 'Total',     value: stats.total,                                           color: 'text-white'       },
          { label: 'Success',   value: stats.success,                                         color: 'text-green-400'   },
          { label: 'Failed',    value: stats.failed,                                          color: 'text-red-400'     },
          { label: 'Cancelled', value: stats.cancelled,                                       color: 'text-yellow-400'  },
          { label: 'Filament',  value: stats.totalG > 1000 ? `${(stats.totalG/1000).toFixed(2)}kg` : `${Math.round(stats.totalG)}g`, color: 'text-accent-400' },
        ] as const).map((s) => (
          <div key={s.label} className="rounded-xl border border-surface-border bg-surface-1 px-4 py-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Projects section ────────────────────────────────────────────────── */}
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
                  <p className="text-xs text-gray-500">Created {format(new Date(p.created_at), 'MMM d, yyyy')}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="File, project, printer…"
            className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>

        <select value={outcomeFilter} onChange={(e) => { setOutcomeFilter(e.target.value); setPage(1) }} className={filterSelectCls}>
          <option value="">All outcomes</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {printerOptions.length > 0 && (
          <select value={printerFilter} onChange={(e) => { setPrinterFilter(e.target.value); setPage(1) }} className={filterSelectCls}>
            <option value="">All printers</option>
            {printerOptions.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </select>
        )}

        {projectsData.length > 0 && (
          <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1) }} className={filterSelectCls}>
            <option value="">All projects</option>
            {projectsData.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        )}

        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300 transition-colors">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}

        <div className="ml-auto flex rounded-lg border border-surface-border bg-surface-2 p-0.5">
          <button
            onClick={() => setView('table')}
            className={cn('rounded p-1.5 transition-colors', view === 'table' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}
            title="Table view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('grid')}
            className={cn('rounded p-1.5 transition-colors', view === 'grid' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-border bg-surface-1 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-gray-600" />
          <div>
            <p className="text-sm font-medium text-gray-300">{hasFilters ? 'No jobs match the current filters.' : 'No print jobs yet.'}</p>
            {!hasFilters && <p className="mt-0.5 text-xs text-gray-500">Log a job to start tracking filament usage.</p>}
          </div>
          {!hasFilters && (
            <Button onClick={() => setShowLogModal(true)}>
              <Plus className="h-4 w-4" /> Log first job
            </Button>
          )}
        </div>
      ) : view === 'table' ? (

        /* ── Table ── */
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                <SortTh col="date"     label="Date"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="pl-5" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Job</th>
                <SortTh col="outcome"  label="Outcome"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Printer</th>
                <SortTh col="filament" label="Filament" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="duration" label="Duration" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {paged.map((job) => {
                const title = jobTitle(job)
                const spoolLabel = job.spools.length > 0
                  ? job.spools.map((s) => s.spool?.name ?? `Spool #${s.spool_id}`).join(', ')
                  : job.spool ? (job.spool.name ?? `Spool #${job.spool.id}`) : null
                return (
                  <tr
                    key={job.id}
                    onClick={() => setViewJob(job)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors group"
                  >
                    <td className="whitespace-nowrap pl-5 pr-4 py-3 text-xs text-gray-500">
                      {job.finished_at
                        ? <span title={format(new Date(job.finished_at), 'PPpp')}>{formatDistanceToNow(new Date(job.finished_at), { addSuffix: true })}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="truncate font-medium text-white">
                        {title ?? <span className="italic text-gray-500 font-normal">Unnamed</span>}
                      </p>
                      {spoolLabel && (
                        <p className="truncate text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Package className="h-3 w-3 shrink-0" />{spoolLabel}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <OutcomeBadge outcome={job.outcome as PrintJobOutcome} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {job.printer
                        ? <span className="flex items-center gap-1"><PrinterIcon className="h-3 w-3" />{job.printer.name}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-gray-300 whitespace-nowrap">
                      {job.filament_used_g != null
                        ? <span className="flex items-center gap-1"><Layers className="h-3 w-3 text-gray-500" />{job.filament_used_g}g</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-gray-400 whitespace-nowrap">
                      {job.duration_seconds
                        ? <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-gray-500" />{formatDuration(job.duration_seconds)}</span>
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      ) : (

        /* ── Grid ── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paged.map((job) => {
            const title = jobTitle(job)
            const cfg   = OUTCOME_CONFIG[job.outcome as PrintJobOutcome]
            const spoolLabel = job.spools.length > 0
              ? job.spools.map((s) => s.spool?.name ?? `Spool #${s.spool_id}`).join(', ')
              : job.spool ? (job.spool.name ?? `Spool #${job.spool.id}`) : null
            return (
              <div
                key={job.id}
                onClick={() => setViewJob(job)}
                className="rounded-xl border border-surface-border bg-surface-1 p-4 cursor-pointer hover:bg-surface-2 hover:border-primary-500/40 transition-colors space-y-3"
              >
                {/* Top photo thumbnail */}
                {job.photos.length > 0 && (
                  <div className="-mx-4 -mt-4 h-32 overflow-hidden rounded-t-xl">
                    <img src={job.photos[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', cfg.badge === 'success' ? 'bg-green-900/40 text-green-400' : cfg.badge === 'danger' ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400')}>
                    {cfg.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {title ?? <span className="italic text-gray-500 font-normal">Unnamed job</span>}
                    </p>
                    <OutcomeBadge outcome={job.outcome as PrintJobOutcome} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {job.finished_at && (
                    <span>{format(new Date(job.finished_at), 'MMM d, yyyy')}</span>
                  )}
                  {job.printer && (
                    <span className="flex items-center gap-1"><PrinterIcon className="h-3 w-3" />{job.printer.name}</span>
                  )}
                  {spoolLabel && (
                    <span className="flex items-center gap-1 truncate max-w-[180px]"><Package className="h-3 w-3 shrink-0" />{spoolLabel}</span>
                  )}
                  {job.filament_used_g != null && (
                    <span className="flex items-center gap-1"><Layers className="h-3 w-3" />{job.filament_used_g}g</span>
                  )}
                  {job.duration_seconds && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(job.duration_seconds)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────────── */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {sorted.length} result{sorted.length !== 1 ? 's' : ''} · page {safePage} of {pageCount}
          </p>
          <div className="flex items-center gap-1">
            <PageBtn disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
            {pageNumbers(safePage, pageCount).map((n, i) =>
              n === '…' ? (
                <span key={`e${i}`} className="px-2 text-gray-600 text-sm select-none">…</span>
              ) : (
                <PageBtn key={n} active={n === safePage} onClick={() => setPage(n as number)}>{n}</PageBtn>
              )
            )}
            <PageBtn disabled={safePage >= pageCount} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {viewJob       && <JobDetailModal job={viewJob}  onClose={() => setViewJob(null)} />}
      {showLogModal  && <LogJobModal    onClose={() => setShowLogModal(false)} />}
      {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
    </div>
  )
}

function PageBtn({ onClick, disabled, active, children }: {
  onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[32px] rounded-lg px-2 py-1 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        active ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-surface-2 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}
