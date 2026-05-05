import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle, XCircle, MinusCircle, ClipboardList,
  Printer as PrinterIcon, Package, Clock, Layers, Trash2, FolderOpen,
  Search, List, LayoutGrid, ChevronDown, ChevronUp, X,
} from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { printJobsApi } from '@/api/print-jobs'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/utils/cn'
import { formatDistanceToNow, format } from 'date-fns'
import type { PrintJobResponse, PrintJobOutcome } from '@/types/api'
import { DeleteConfirm } from './EditJobModal'
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

// ── Helpers ────────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'outcome' | 'filament' | 'duration'

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
          : <ChevronDown className="h-3 w-3 opacity-0" />}
      </span>
    </th>
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [view,          setView]          = useState<'table' | 'grid'>('table')
  const [search,        setSearch]        = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [printerFilter, setPrinterFilter] = useState('')
  const [sortBy,        setSortBy]        = useState<SortKey>('date')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc')
  const [page,          setPage]          = useState(1)
  const [viewJob,       setViewJob]       = useState<PrintJobResponse | null>(null)
  const [showDeleteProject, setShowDeleteProject] = useState(false)

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectsApi.get(projectId),
  })

  const { data: jobsPage, isLoading: jobsLoading } = useQuery({
    queryKey: ['print-jobs', { project_id: projectId }],
    queryFn: () => printJobsApi.list({ project_id: projectId, page_size: 200 }),
    staleTime: 0,
  })

  const deleteProjectMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/print-jobs')
    },
  })

  const allJobs = jobsPage?.items ?? []

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:     allJobs.length,
    success:   allJobs.filter((j) => j.outcome === 'success').length,
    failed:    allJobs.filter((j) => j.outcome === 'failed').length,
    cancelled: allJobs.filter((j) => j.outcome === 'cancelled').length,
    totalG:    allJobs.reduce((s, j) => s + (j.filament_used_g ?? 0), 0),
  }), [allJobs])

  // ── Filter options ─────────────────────────────────────────────────────────

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
        (j.printer?.name ?? '').toLowerCase().includes(q) ||
        (j.notes ?? '').toLowerCase().includes(q) ||
        j.spools.some((s) => (s.spool?.name ?? '').toLowerCase().includes(q))
      )
    }
    if (outcomeFilter) r = r.filter((j) => j.outcome === outcomeFilter)
    if (printerFilter) r = r.filter((j) => j.printer && String(j.printer.id) === printerFilter)
    return r
  }, [allJobs, search, outcomeFilter, printerFilter])

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

  const hasFilters = !!(search || outcomeFilter || printerFilter)

  function clearFilters() {
    setSearch(''); setOutcomeFilter(''); setPrinterFilter('')
  }

  function jobTitle(job: PrintJobResponse): string | null {
    return job.file_name ?? (job.plate_number != null ? `Plate ${job.plate_number}` : null)
  }

  const filterSelectCls = 'rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none'

  if (projectLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">

      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/print-jobs"
          className="mt-0.5 rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary-400 shrink-0" />
            {project?.name ?? 'Project'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            {allJobs.length} {allJobs.length === 1 ? 'job' : 'jobs'}
            {project?.created_at && ` · Created ${format(new Date(project.created_at), 'MMM d, yyyy')}`}
          </p>
        </div>

        {showDeleteProject ? (
          <DeleteConfirm
            label="Delete this project and all its jobs?"
            loading={deleteProjectMutation.isPending}
            onConfirm={() => deleteProjectMutation.mutate()}
            onCancel={() => setShowDeleteProject(false)}
          />
        ) : (
          <Button variant="danger" size="sm" onClick={() => setShowDeleteProject(true)} className="shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
            Delete project
          </Button>
        )}
      </div>

      {/* Stats bar */}
      {allJobs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {([
            { label: 'Total',     value: stats.total,     color: 'text-white'      },
            { label: 'Success',   value: stats.success,   color: 'text-green-400'  },
            { label: 'Failed',    value: stats.failed,    color: 'text-red-400'    },
            { label: 'Cancelled', value: stats.cancelled, color: 'text-yellow-400' },
            { label: 'Filament',  value: stats.totalG > 1000 ? `${(stats.totalG / 1000).toFixed(2)}kg` : `${Math.round(stats.totalG)}g`, color: 'text-accent-400' },
          ] as const).map((s) => (
            <div key={s.label} className="rounded-xl border border-surface-border bg-surface-1 px-4 py-3">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {allJobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="File, printer, spool…"
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
      )}

      {/* Content */}
      {jobsLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-border bg-surface-1 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-gray-600" />
          <div>
            <p className="text-sm font-medium text-gray-300">
              {hasFilters ? 'No jobs match the current filters.' : 'No jobs in this project yet.'}
            </p>
            {!hasFilters && <p className="mt-0.5 text-xs text-gray-500">Log a job and assign it to this project.</p>}
          </div>
          {!hasFilters && (
            <Link to="/print-jobs">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Print Jobs
              </Button>
            </Link>
          )}
        </div>
      ) : view === 'table' ? (

        /* Table */
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
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
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

        /* Grid */
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
                {job.photos.length > 0 && (
                  <div className="-mx-4 -mt-4 h-32 overflow-hidden rounded-t-xl">
                    <img src={job.photos[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    cfg.badge === 'success' ? 'bg-green-900/40 text-green-400' :
                    cfg.badge === 'danger'  ? 'bg-red-900/40 text-red-400'     :
                                              'bg-yellow-900/40 text-yellow-400',
                  )}>
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

      {/* Pagination */}
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

      {/* Detail modal */}
      {viewJob && <JobDetailModal job={viewJob} onClose={() => setViewJob(null)} />}
    </div>
  )
}
