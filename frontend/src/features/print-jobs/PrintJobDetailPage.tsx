import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle, XCircle, MinusCircle, ClipboardList,
  Printer as PrinterIcon, Package, Clock, Layers, Pencil, Trash2,
  Hash, FolderOpen, StickyNote,
} from 'lucide-react'
import { printJobsApi } from '@/api/print-jobs'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'
import type { PrintJobOutcome } from '@/types/api'
import { EditJobModal, DeleteConfirm } from './EditJobModal'

// ── Outcome config ─────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<PrintJobOutcome, {
  label: string
  icon: React.ReactNode
  badge: 'success' | 'danger' | 'warning'
  bg: string
  text: string
}> = {
  success:   { label: 'Success',   icon: <CheckCircle  className="h-4 w-4" />, badge: 'success', bg: 'bg-green-900/40',  text: 'text-green-400'  },
  failed:    { label: 'Failed',    icon: <XCircle      className="h-4 w-4" />, badge: 'danger',  bg: 'bg-red-900/40',    text: 'text-red-400'    },
  cancelled: { label: 'Cancelled', icon: <MinusCircle  className="h-4 w-4" />, badge: 'warning', bg: 'bg-yellow-900/40', text: 'text-yellow-400' },
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m${s ? ` ${s}s` : ''}`
  if (m > 0) return `${m}m${s ? ` ${s}s` : ''}`
  return `${s}s`
}

// ── Detail row ─────────────────────────────────────────────────────────────────

function DetailRow({ icon, label, children }: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-surface-border last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-gray-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <div className="text-sm text-white">{children}</div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PrintJobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const jobId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showEdit,   setShowEdit]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const { data: job, isLoading } = useQuery({
    queryKey: ['print-jobs', jobId],
    queryFn: () => printJobsApi.get(jobId),
    staleTime: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: () => printJobsApi.delete(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-jobs'] })
      qc.invalidateQueries({ queryKey: ['spools'] })
      navigate(-1)
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <ClipboardList className="h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-400">Job not found.</p>
        <Button variant="secondary" onClick={() => navigate('/print-jobs')}>
          Back to Print Jobs
        </Button>
      </div>
    )
  }

  const cfg = OUTCOME_CONFIG[job.outcome as PrintJobOutcome]

  const title = job.project
    ? job.project.name + (job.plate_number != null ? ` — Plate ${job.plate_number}` : '')
    : job.file_name ?? null

  const spoolLabel = job.spools.length > 0
    ? job.spools.map((s) => {
        const name = s.spool?.name ?? `Spool #${s.spool_id}`
        return `${name} (${s.filament_used_g}g)`
      }).join(', ')
    : job.spool
      ? (job.spool.name ?? `Spool #${job.spool.id}`)
      : null

  return (
    <div className="p-5 lg:p-7 max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold text-white flex-1 truncate">
          {title ?? <span className="text-gray-500 italic font-normal">Unnamed job</span>}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="secondary" onClick={() => setShowEdit(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Delete confirm */}
      {showDelete && (
        <DeleteConfirm
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {/* Photos gallery */}
      {job.photos.length > 0 && (
        <div className={cn(
          'grid gap-2 rounded-xl overflow-hidden',
          job.photos.length === 1 ? 'grid-cols-1' :
          job.photos.length === 2 ? 'grid-cols-2' :
                                     'grid-cols-3',
        )}>
          {job.photos.map((src, i) => (
            <button
              key={i}
              onClick={() => setLightboxSrc(src)}
              className={cn(
                'block overflow-hidden rounded-xl border border-surface-border',
                'hover:opacity-90 transition-opacity focus:outline-none',
                job.photos.length >= 3 && i === 0 ? 'col-span-2 row-span-2' : '',
              )}
            >
              <img
                src={src}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover"
                style={{ aspectRatio: job.photos.length === 1 ? '16/9' : '1/1' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Outcome + date row */}
      <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-1 px-4 py-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', cfg.bg, cfg.text)}>
          {cfg.icon}
        </div>
        <div>
          <Badge variant={cfg.badge} className="flex items-center gap-1">
            {cfg.icon}
            {cfg.label}
          </Badge>
          {job.finished_at && (
            <p className="mt-0.5 text-xs text-gray-500">
              {format(new Date(job.finished_at), 'EEEE, MMMM d, yyyy · h:mm a')}
            </p>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-xl border border-surface-border bg-surface-1 px-4 divide-y-0">

        {job.project && (
          <DetailRow icon={<FolderOpen className="h-4 w-4" />} label="Project">
            <Link
              to={`/print-jobs/projects/${job.project.id}`}
              className="text-primary-400 hover:text-primary-300 transition-colors"
            >
              {job.project.name}
            </Link>
          </DetailRow>
        )}

        {job.plate_number != null && (
          <DetailRow icon={<Hash className="h-4 w-4" />} label="Plate number">
            {job.plate_number}
          </DetailRow>
        )}

        {job.file_name && (
          <DetailRow icon={<ClipboardList className="h-4 w-4" />} label="File name">
            <span className="font-mono text-xs">{job.file_name}</span>
          </DetailRow>
        )}

        {job.printer && (
          <DetailRow icon={<PrinterIcon className="h-4 w-4" />} label="Printer">
            {job.printer.name}
            {job.printer.model && <span className="text-gray-500"> · {job.printer.model}</span>}
          </DetailRow>
        )}

        {spoolLabel && (
          <DetailRow icon={<Package className="h-4 w-4" />} label="Spools used">
            {spoolLabel}
          </DetailRow>
        )}

        {job.filament_used_g != null && (
          <DetailRow icon={<Layers className="h-4 w-4" />} label="Total filament used">
            <span className="font-semibold">{job.filament_used_g}g</span>
          </DetailRow>
        )}

        {job.duration_seconds != null && (
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Duration">
            {formatDuration(job.duration_seconds)}
          </DetailRow>
        )}

        {job.notes && (
          <DetailRow icon={<StickyNote className="h-4 w-4" />} label="Notes">
            <p className="text-gray-300 whitespace-pre-wrap">{job.notes}</p>
          </DetailRow>
        )}

      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditJobModal
          job={job}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
