import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, CheckCircle, XCircle, MinusCircle, ClipboardList,
  Printer as PrinterIcon, Package, Clock, Layers, FolderOpen,
  Hash, StickyNote, Calendar, Pencil, Trash2,
} from 'lucide-react'
import { printJobsApi } from '@/api/print-jobs'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'
import type { PrintJobResponse, PrintJobOutcome } from '@/types/api'
import { EditJobModal, DeleteConfirm } from './EditJobModal'

// ── Outcome config ─────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<PrintJobOutcome, {
  label: string; icon: React.ReactNode
  badge: 'success' | 'danger' | 'warning'; bg: string; text: string
}> = {
  success:   { label: 'Success',   icon: <CheckCircle  className="h-4 w-4" />, badge: 'success', bg: 'bg-green-900/40',  text: 'text-green-400'  },
  failed:    { label: 'Failed',    icon: <XCircle      className="h-4 w-4" />, badge: 'danger',  bg: 'bg-red-900/40',    text: 'text-red-400'    },
  cancelled: { label: 'Cancelled', icon: <MinusCircle  className="h-4 w-4" />, badge: 'warning', bg: 'bg-yellow-900/40', text: 'text-yellow-400' },
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m${s ? ` ${s}s` : ''}`
  if (m > 0) return `${m}m${s ? ` ${s}s` : ''}`
  return `${s}s`
}

// ── Section helpers ────────────────────────────────────────────────────────────

function ViewField({ label, icon, children }: {
  label: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-gray-500 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  )
}

function ViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{title}</h3>
      <div className="rounded-xl bg-surface-2 border border-surface-border p-4 space-y-3">
        {children}
      </div>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────────

export function JobDetailModal({ job, onClose }: { job: PrintJobResponse; onClose: () => void }) {
  const qc = useQueryClient()
  const [showEdit,   setShowEdit]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [lightbox,   setLightbox]   = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: () => printJobsApi.delete(job.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-jobs'] })
      qc.invalidateQueries({ queryKey: ['spools'] })
      onClose()
    },
  })

  const cfg = OUTCOME_CONFIG[job.outcome as PrintJobOutcome]

  const title = job.project
    ? job.project.name + (job.plate_number != null ? ` — Plate ${job.plate_number}` : '')
    : job.file_name ?? null

  const spoolEntries = job.spools.length > 0 ? job.spools : []

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative w-full max-w-2xl rounded-2xl border border-surface-border bg-surface-1 shadow-2xl max-h-[90vh] overflow-y-auto">

          {/* Photos header */}
          {job.photos.length === 1 && (
            <button
              onClick={() => setLightbox(job.photos[0])}
              className="relative h-52 w-full overflow-hidden rounded-t-2xl block focus:outline-none"
            >
              <img src={job.photos[0]} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-1/80" />
            </button>
          )}
          {job.photos.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto p-3 rounded-t-2xl bg-surface-2">
              {job.photos.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setLightbox(src)}
                  className="relative h-36 w-36 shrink-0 overflow-hidden rounded-xl border border-surface-border focus:outline-none hover:opacity-90 transition-opacity"
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', cfg.bg, cfg.text)}>
                {cfg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-white truncate">
                  {title ?? <span className="italic text-gray-500 font-normal">Unnamed job</span>}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={cfg.badge} className="flex items-center gap-1">
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                  {job.finished_at && (
                    <span className="text-xs text-gray-500">
                      {format(new Date(job.finished_at), 'MMM d, yyyy · h:mm a')}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 shrink-0 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Job details section */}
            <ViewSection title="Job Details">
              <div className="grid grid-cols-2 gap-3">
                {job.project && (
                  <ViewField label="Project" icon={<FolderOpen className="h-3.5 w-3.5" />}>
                    <Link
                      to={`/print-jobs/projects/${job.project.id}`}
                      onClick={onClose}
                      className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                    >
                      {job.project.name}
                    </Link>
                  </ViewField>
                )}
                {job.plate_number != null && (
                  <ViewField label="Plate number" icon={<Hash className="h-3.5 w-3.5" />}>
                    <span className="text-sm text-white">{job.plate_number}</span>
                  </ViewField>
                )}
                {job.file_name && (
                  <div className="col-span-2">
                    <ViewField label="File name" icon={<ClipboardList className="h-3.5 w-3.5" />}>
                      <span className="text-sm text-white font-mono break-all">{job.file_name}</span>
                    </ViewField>
                  </div>
                )}
                {job.printer && (
                  <ViewField label="Printer" icon={<PrinterIcon className="h-3.5 w-3.5" />}>
                    <span className="text-sm text-white">
                      {job.printer.name}
                      {job.printer.model && <span className="text-gray-500"> · {job.printer.model}</span>}
                    </span>
                  </ViewField>
                )}
                {job.duration_seconds != null && (
                  <ViewField label="Duration" icon={<Clock className="h-3.5 w-3.5" />}>
                    <span className="text-sm text-white">{formatDuration(job.duration_seconds)}</span>
                  </ViewField>
                )}
                {job.finished_at && (
                  <ViewField label="Date printed" icon={<Calendar className="h-3.5 w-3.5" />}>
                    <span className="text-sm text-white">{format(new Date(job.finished_at), 'MMM d, yyyy')}</span>
                  </ViewField>
                )}
              </div>
            </ViewSection>

            {/* Spools section */}
            {spoolEntries.length > 0 && (
              <ViewSection title="Filament Used">
                <div className="space-y-2">
                  {spoolEntries.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        <span className="text-sm text-white">
                          {s.spool?.name ?? `Spool #${s.spool_id}`}
                        </span>
                        {s.spool?.filament?.material && (
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-gray-400">
                            {s.spool.filament.material}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-white tabular-nums">{s.filament_used_g}g</span>
                    </div>
                  ))}
                  {job.filament_used_g != null && spoolEntries.length > 1 && (
                    <div className="flex items-center justify-between border-t border-surface-border pt-2">
                      <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                        <span className="text-sm text-gray-400">Total</span>
                      </div>
                      <span className="text-sm font-semibold text-white tabular-nums">{job.filament_used_g}g</span>
                    </div>
                  )}
                </div>
              </ViewSection>
            )}

            {/* Notes */}
            {job.notes && (
              <ViewSection title="Notes">
                <div className="flex items-start gap-2">
                  <StickyNote className="h-3.5 w-3.5 text-gray-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{job.notes}</p>
                </div>
              </ViewSection>
            )}

            {/* Delete confirm */}
            {showDelete && (
              <DeleteConfirm
                loading={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate()}
                onCancel={() => setShowDelete(false)}
              />
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-surface-border">
              <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                <Button size="sm" onClick={() => setShowEdit(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit job
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showEdit && <EditJobModal job={job} onClose={() => setShowEdit(false)} />}

      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  )
}
