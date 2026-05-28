import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, FolderOpen, Search, ChevronRight,
  CheckCircle, XCircle, MinusCircle,
  ClipboardList, Flame, Layers, Trophy,
  Clock, Package,
} from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { printJobsApi } from '@/api/print-jobs'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { NewProjectWizard } from './NewProjectWizard'
import { formatDistanceToNow, format } from 'date-fns'
import type { ProjectResponse, PrintJobResponse } from '@/types/api'

// ── Helpers ────────────────────────────────────────────────────────────────────

interface ProjectStats {
  jobCount:     number
  successCount: number
  failCount:    number
  cancelCount:  number
  filamentG:    number
  lastActivity: string | null
}

function computeStats(jobs: PrintJobResponse[]): ProjectStats {
  return {
    jobCount:     jobs.length,
    successCount: jobs.filter((j) => j.outcome === 'success').length,
    failCount:    jobs.filter((j) => j.outcome === 'failed').length,
    cancelCount:  jobs.filter((j) => j.outcome === 'cancelled').length,
    filamentG:    jobs.reduce((s, j) => s + (j.filament_used_g ?? 0), 0),
    lastActivity: jobs.reduce<string | null>((latest, j) => {
      if (!latest) return j.finished_at
      return j.finished_at > latest ? j.finished_at : latest
    }, null),
  }
}

function formatFilament(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ReactNode; color: string
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 px-5 py-4 flex items-center gap-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', color)}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, stats }: { project: ProjectResponse; stats: ProjectStats }) {
  const successPct = stats.jobCount > 0
    ? Math.round((stats.successCount / stats.jobCount) * 100)
    : null

  return (
    <Link
      to={`/print-jobs/projects/${project.id}`}
      className="group flex flex-col rounded-2xl border border-surface-border bg-surface-1 overflow-hidden hover:border-primary-500/50 hover:shadow-lg transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15">
          <FolderOpen className="h-5 w-5 text-primary-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate group-hover:text-primary-300 transition-colors">
            {project.name}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Created {format(new Date(project.created_at), 'MMM d, yyyy')}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-600 group-hover:text-primary-400 transition-colors mt-0.5" />
      </div>

      {/* Stats row */}
      {stats.jobCount === 0 ? (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-600 italic">No jobs logged yet</p>
        </div>
      ) : (
        <div className="px-4 pb-3 space-y-2.5">
          {/* Outcome breakdown bar */}
          <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-surface-3">
            {stats.successCount > 0 && (
              <div
                className="bg-emerald-500 rounded-full"
                style={{ width: `${(stats.successCount / stats.jobCount) * 100}%` }}
              />
            )}
            {stats.failCount > 0 && (
              <div
                className="bg-red-500 rounded-full"
                style={{ width: `${(stats.failCount / stats.jobCount) * 100}%` }}
              />
            )}
            {stats.cancelCount > 0 && (
              <div
                className="bg-yellow-500 rounded-full"
                style={{ width: `${(stats.cancelCount / stats.jobCount) * 100}%` }}
              />
            )}
          </div>

          {/* Numbers */}
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle className="h-3 w-3" /> {stats.successCount}
            </span>
            {stats.failCount > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <XCircle className="h-3 w-3" /> {stats.failCount}
              </span>
            )}
            {stats.cancelCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-400">
                <MinusCircle className="h-3 w-3" /> {stats.cancelCount}
              </span>
            )}
            {successPct !== null && (
              <span className="ml-auto text-gray-500">{successPct}% success</span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-surface-border bg-surface-2/40 px-4 py-2.5 mt-auto">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <ClipboardList className="h-3 w-3" />
          {stats.jobCount} job{stats.jobCount !== 1 ? 's' : ''}
        </span>
        {stats.filamentG > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <Package className="h-3 w-3" />
            {formatFilament(stats.filamentG)}
          </span>
        )}
        {stats.lastActivity && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-600">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(stats.lastActivity), { addSuffix: true })}
          </span>
        )}
      </div>
    </Link>
  )
}

// ── Unassigned jobs section ───────────────────────────────────────────────────

function UnassignedSection({ jobs }: { jobs: PrintJobResponse[] }) {
  const [open, setOpen] = useState(false)
  if (jobs.length === 0) return null

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 hover:bg-surface-2/40 transition-colors"
      >
        <ClipboardList className="h-4 w-4 text-gray-500 shrink-0" />
        <span className="text-sm font-medium text-gray-300 flex-1 text-left">
          Standalone Jobs
        </span>
        <span className="text-xs text-gray-500 tabular-nums">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
        <ChevronRight className={cn('h-4 w-4 text-gray-600 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="border-t border-surface-border divide-y divide-surface-border/60">
          {jobs.slice(0, 20).map((job) => {
            const outcomeIcon =
              job.outcome === 'success'   ? <CheckCircle  className="h-3.5 w-3.5 text-emerald-400" /> :
              job.outcome === 'failed'    ? <XCircle      className="h-3.5 w-3.5 text-red-400" />     :
                                           <MinusCircle  className="h-3.5 w-3.5 text-yellow-400" />
            return (
              <Link
                key={job.id}
                to={`/print-jobs/${job.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/40 transition-colors"
              >
                {outcomeIcon}
                <span className="text-sm text-gray-200 flex-1 truncate">
                  {job.file_name ?? `Job #${job.id}`}
                </span>
                <span className="text-xs text-gray-500 shrink-0">
                  {format(new Date(job.finished_at), 'MMM d, yyyy')}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 shrink-0" />
              </Link>
            )
          })}
          {jobs.length > 20 && (
            <p className="px-5 py-3 text-xs text-gray-500 text-center">
              +{jobs.length - 20} more — view all in project detail
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PrintJobsPage() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [search,     setSearch]     = useState('')

  const { data: projects = [],   isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn:  projectsApi.list,
  })
  const { data: jobsPage, isLoading: loadingJobs } = useQuery({
    queryKey: ['print-jobs', 'all-dashboard'],
    queryFn:  () => printJobsApi.list({ page_size: 200 }),
  })

  const allJobs = jobsPage?.items ?? []
  const isLoading = loadingProjects || loadingJobs

  // Per-project job maps
  const statsByProject = useMemo<Map<number, ProjectStats>>(() => {
    const map = new Map<number, PrintJobResponse[]>()
    for (const job of allJobs) {
      if (job.project_id !== null) {
        const arr = map.get(job.project_id) ?? []
        arr.push(job)
        map.set(job.project_id, arr)
      }
    }
    const result = new Map<number, ProjectStats>()
    for (const [id, jobs] of map) result.set(id, computeStats(jobs))
    return result
  }, [allJobs])

  // Global stats
  const globalStats = useMemo(() => {
    const total      = allJobs.length
    const succeeded  = allJobs.filter((j) => j.outcome === 'success').length
    const filamentG  = allJobs.reduce((s, j) => s + (j.filament_used_g ?? 0), 0)
    const rate       = total > 0 ? Math.round((succeeded / total) * 100) : 0
    return { projects: projects.length, jobs: total, rate, filamentG }
  }, [allJobs, projects])

  // Standalone jobs (no project)
  const standaloneJobs = useMemo(
    () => allJobs.filter((j) => j.project_id === null),
    [allJobs],
  )

  // Filtered + sorted projects
  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? projects.filter((p) => p.name.toLowerCase().includes(q))
      : projects
    return [...list].sort((a, b) => {
      const la = statsByProject.get(a.id)?.lastActivity ?? a.created_at
      const lb = statsByProject.get(b.id)?.lastActivity ?? b.created_at
      return lb.localeCompare(la)
    })
  }, [projects, search, statsByProject])

  return (
    <div className="p-5 lg:p-7 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">My Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your prints, organized by project.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Projects"
          value={globalStats.projects}
          icon={<Layers className="h-5 w-5 text-primary-400" />}
          color="bg-primary-500/15"
        />
        <StatCard
          label="Total Jobs"
          value={globalStats.jobs}
          icon={<ClipboardList className="h-5 w-5 text-blue-400" />}
          color="bg-blue-500/15"
        />
        <StatCard
          label="Success Rate"
          value={`${globalStats.rate}%`}
          icon={<Trophy className="h-5 w-5 text-emerald-400" />}
          color="bg-emerald-500/15"
        />
        <StatCard
          label="Filament Used"
          value={formatFilament(globalStats.filamentG)}
          icon={<Flame className="h-5 w-5 text-orange-400" />}
          color="bg-orange-500/15"
        />
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
      )}

      {/* ── Projects grid ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-2xl border border-surface-border bg-surface-1 animate-pulse" />
          ))}
        </div>
      ) : filteredProjects.length === 0 && search ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-surface-border py-16 text-center">
          <Search className="h-8 w-8 text-gray-600" />
          <p className="text-sm text-gray-400">No projects match "{search}"</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-surface-border py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
            <FolderOpen className="h-8 w-8 text-gray-600" />
          </div>
          <div>
            <p className="text-base font-medium text-gray-300">No projects yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Create your first project to start tracking your prints.
            </p>
          </div>
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              stats={statsByProject.get(project.id) ?? {
                jobCount: 0, successCount: 0, failCount: 0,
                cancelCount: 0, filamentG: 0, lastActivity: null,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Standalone jobs ─────────────────────────────────────────────────── */}
      {!isLoading && <UnassignedSection jobs={standaloneJobs} />}

      {/* ── Wizard ─────────────────────────────────────────────────────────── */}
      {wizardOpen && <NewProjectWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
