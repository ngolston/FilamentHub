import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, FolderOpen, Pencil, Trash2, Check, X, Plus,
  Star, Link2, User, Clock, Package, Layers, Printer as PrinterIcon,
  ChevronDown, ChevronUp, MessageSquare, DollarSign, Send,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { projectsApi } from '@/api/projects'
import { printJobsApi } from '@/api/print-jobs'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/utils/cn'
import type { ProjectResponse, PlateDatum, ProjectComment, ProjectUpdate } from '@/types/api'
import { BUILTIN_STATUSES, getCustomStatuses, saveCustomStatuses, statusColor, getAllStatuses } from './projectStatuses'
import type { StatusEntry } from './projectStatuses'
import { formatDuration } from './JobDetailModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function uid(): string { return Math.random().toString(36).slice(2) }

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ status, size = 'md' }: { status: string | null; size?: 'sm' | 'md' }) {
  if (!status) return <span className="text-xs text-gray-600 italic">No Status</span>
  const color = statusColor(status)
  return (
    <span
      className={cn('inline-flex items-center rounded-full font-medium', size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs')}
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {status}
    </span>
  )
}

// ── StatusPicker ──────────────────────────────────────────────────────────────

function StatusPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [customStatuses, setCustomStatuses] = useState<StatusEntry[]>(getCustomStatuses)
  const [addingNew, setAddingNew]           = useState(false)
  const [newName,   setNewName]             = useState('')
  const [newColor,  setNewColor]            = useState('#6366f1')

  const allStatuses = [...BUILTIN_STATUSES, ...customStatuses]

  function handleAdd() {
    if (!newName.trim()) return
    const entry: StatusEntry = { name: newName.trim(), color: newColor, custom: true }
    const updated = [...customStatuses, entry]
    setCustomStatuses(updated)
    saveCustomStatuses(updated)
    onChange(entry.name)
    setAddingNew(false)
    setNewName('')
    setNewColor('#6366f1')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allStatuses.map((s) => {
          const sel = value === s.name
          return (
            <button key={s.name} onClick={() => onChange(sel ? null : s.name)}
              className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                sel ? 'border-transparent text-white' : 'border-surface-border bg-surface-2 text-gray-400 hover:border-gray-500 hover:text-gray-200',
              )}
              style={sel ? { backgroundColor: s.color, borderColor: s.color } : undefined}
            >
              {sel && <Check className="h-3 w-3" />}
              {s.name}
            </button>
          )
        })}
        {!addingNew && (
          <button onClick={() => setAddingNew(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-surface-border px-3 py-1 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors">
            <Plus className="h-3 w-3" /> Add new
          </button>
        )}
      </div>
      {addingNew && (
        <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-2 p-2.5">
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
            className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAddingNew(false) }}
            placeholder="Status name…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none" />
          <button onClick={handleAdd} className="rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-500">Add</button>
          <button onClick={() => setAddingNew(false)} className="text-gray-500 hover:text-gray-300"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  )
}

// ── PlateCard ─────────────────────────────────────────────────────────────────

function PlateCard({
  plate, editing, onUpdate,
}: {
  plate: PlateDatum
  editing: boolean
  onUpdate: (patch: Partial<PlateDatum>) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 hover:bg-surface-2/40 transition-colors"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-sm font-bold text-primary-400 tabular-nums">
          {plate.index}
        </div>
        <span className="flex-1 text-left text-sm font-semibold text-white">Plate {plate.index}</span>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          {plate.weight_g > 0 && <span className="flex items-center gap-1"><Package className="h-3 w-3" />{plate.weight_g.toFixed(1)}g</span>}
          {plate.prediction_seconds > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(plate.prediction_seconds)}</span>}
          {plate.status && <StatusChip status={plate.status} size="sm" />}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-600 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-600 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-surface-border px-5 py-4 space-y-4">
          {/* Stats row */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Weight</p>
              <p className="font-semibold text-white">{plate.weight_g.toFixed(2)} g</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Print Time</p>
              <p className="font-semibold text-white">{plate.prediction_seconds > 0 ? fmtTime(plate.prediction_seconds) : '—'}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Objects</p>
              <p className="font-semibold text-white">{plate.objects.length}</p>
            </div>
          </div>

          {/* Objects list */}
          {plate.objects.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Objects</p>
              <div className="flex flex-wrap gap-1.5">
                {plate.objects.map((obj, i) => (
                  <span key={i} className="rounded-full bg-surface-2 border border-surface-border px-2.5 py-0.5 text-xs text-gray-300">{obj}</span>
                ))}
              </div>
            </div>
          )}

          {/* Filaments */}
          {plate.filaments.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Filament Usage</p>
              <div className="space-y-1.5">
                {plate.filaments.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="h-4 w-4 shrink-0 rounded-full border border-white/10" style={{ backgroundColor: f.color }} />
                    <span className="text-xs font-medium text-gray-200">{f.type}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{f.used_g.toFixed(2)} g</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editable fields */}
          <div className="border-t border-surface-border pt-4 space-y-3">
            {/* Status */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Plate Status</p>
              {editing ? (
                <StatusPicker value={plate.status} onChange={(v) => onUpdate({ status: v })} />
              ) : (
                <StatusChip status={plate.status} />
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Notes</p>
              {editing ? (
                <textarea
                  value={plate.notes ?? ''}
                  onChange={(e) => onUpdate({ notes: e.target.value || null })}
                  placeholder="Notes for this plate…"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
                />
              ) : (
                plate.notes
                  ? <p className="text-sm text-gray-300">{plate.notes}</p>
                  : <p className="text-xs text-gray-600 italic">No notes</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MaterialCostSection ───────────────────────────────────────────────────────

function MaterialCostSection({ plates }: { plates: PlateDatum[] }) {
  // Collect unique filament keys across all plates
  const filamentKeys = useMemo(() => {
    const keys = new Set<string>()
    plates.forEach((p) => p.filaments.forEach((f) => keys.add(`${f.type}|${f.color}`)))
    return [...keys]
  }, [plates])

  const [costPerG, setCostPerG] = useState<Record<string, string>>({})

  function getCost(type: string, color: string): number {
    const key = `${type}|${color}`
    return parseFloat(costPerG[key] || '0') || 0
  }

  const platesCost = plates.map((p) => ({
    index: p.index,
    cost: p.filaments.reduce((sum, f) => sum + getCost(f.type, f.color) * f.used_g, 0),
    weight: p.weight_g,
  }))

  const totalCost   = platesCost.reduce((s, p) => s + p.cost, 0)
  const totalWeight = plates.reduce((s, p) => s + p.weight_g, 0)

  if (plates.length === 0) return null

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">Material Cost Analysis</h3>
      </div>

      <div className="p-5 space-y-4">
        {/* Cost per gram inputs */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Enter cost per gram for each filament</p>
          <div className="space-y-2">
            {filamentKeys.map((key) => {
              const [type, color] = key.split('|')
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="h-4 w-4 shrink-0 rounded-full border border-white/10" style={{ backgroundColor: color }} />
                  <span className="text-xs text-gray-300 w-16 shrink-0">{type}</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-xs text-gray-500">$</span>
                    <input
                      type="number" min="0" step="0.001" placeholder="0.025"
                      value={costPerG[key] ?? ''}
                      onChange={(e) => setCostPerG((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-24 rounded-lg border border-surface-border bg-surface-2 px-2 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none tabular-nums"
                    />
                    <span className="text-xs text-gray-500">/ g</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cost table */}
        <div className="rounded-xl border border-surface-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-4 py-2.5 text-left text-gray-400 font-medium">Plate</th>
                <th className="px-4 py-2.5 text-right text-gray-400 font-medium">Weight</th>
                <th className="px-4 py-2.5 text-right text-gray-400 font-medium">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {platesCost.map((p) => (
                <tr key={p.index}>
                  <td className="px-4 py-2.5 text-gray-300">Plate {p.index}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{p.weight.toFixed(2)} g</td>
                  <td className="px-4 py-2.5 text-right text-white tabular-nums font-medium">
                    {p.cost > 0 ? `$${p.cost.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-2/60">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-white">Total</td>
                <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums font-medium">{totalWeight.toFixed(2)} g</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-400">
                  {totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-[10px] text-gray-600">Formula: Cost = (Cost/g) × Usage per filament type per plate</p>
      </div>
    </div>
  )
}

// ── CommentsSection ───────────────────────────────────────────────────────────

function CommentsSection({
  projectId, comments, onSave,
}: {
  projectId: number
  comments: ProjectComment[]
  onSave: (comments: ProjectComment[]) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const trimmed = text.trim()
    if (!trimmed) return
    const next: ProjectComment = { id: uid(), text: trimmed, created_at: new Date().toISOString() }
    setSaving(true)
    try {
      await onSave([...comments, next])
      setText('')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await onSave(comments.filter((c) => c.id !== id))
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-white">Comments</h3>
        <span className="ml-auto text-xs text-gray-500">{comments.length}</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Existing comments */}
        {comments.length > 0 ? (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="group flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-gray-400">
                  N
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-200 leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600 italic">No comments yet. Add tips, notes, or reminders.</p>
        )}

        {/* Add comment */}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd() }}
            placeholder="Add a comment…"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={!text.trim() || saving}
            className="self-end flex items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const projectId   = Number(id)
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  const [editing,       setEditing]       = useState(false)
  const [showDelete,    setShowDelete]    = useState(false)
  const [editForm,      setEditForm]      = useState<Partial<ProjectResponse>>({})
  const [editPlates,    setEditPlates]    = useState<PlateDatum[]>([])

  const { data: project, isLoading } = useQuery({
    queryKey: ['projects', projectId],
    queryFn:  () => projectsApi.get(projectId),
  })

  const { data: jobsPage } = useQuery({
    queryKey: ['print-jobs', { project_id: projectId }],
    queryFn:  () => printJobsApi.list({ project_id: projectId, page_size: 200 }),
    staleTime: 0,
  })

  const allJobs = jobsPage?.items ?? []

  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdate) => projectsApi.update(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/print-jobs')
    },
  })

  function startEdit() {
    if (!project) return
    setEditForm({
      name:            project.name,
      description:     project.description,
      status:          project.status,
      client_requestor: project.client_requestor,
      design_link:     project.design_link,
      is_priority:     project.is_priority,
      designer:        project.designer,
    })
    setEditPlates((project.plate_data ?? []).map((p) => ({ ...p })))
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditForm({})
    setEditPlates([])
  }

  function saveEdit() {
    updateMutation.mutate({
      ...editForm,
      plate_data: editPlates.length ? editPlates : undefined,
    })
  }

  function patchPlate(index: number, patch: Partial<PlateDatum>) {
    setEditPlates((prev) => prev.map((p) => p.index === index ? { ...p, ...patch } : p))
  }

  async function saveComments(comments: ProjectComment[]) {
    await projectsApi.update(projectId, { comments })
    qc.invalidateQueries({ queryKey: ['projects', projectId] })
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (!project)  return <div className="p-8 text-center text-gray-500">Project not found.</div>

  const displayName   = editing ? (editForm.name ?? project.name) : project.name
  const displayStatus = editing ? (editForm.status ?? null) : project.status
  const plates        = editing ? editPlates : (project.plate_data ?? [])
  const totalTime     = plates.reduce((s, p) => s + p.prediction_seconds, 0)
  const totalWeight   = plates.reduce((s, p) => s + p.weight_g, 0)

  return (
    <div className="p-5 lg:p-7 space-y-5 max-w-4xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Link to="/print-jobs"
          className="mt-0.5 rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={editForm.name ?? ''}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-xl font-semibold text-white focus:border-primary-500 focus:outline-none"
            />
          ) : (
            <h1 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
              <FolderOpen className="h-5 w-5 text-primary-400 shrink-0" />
              {displayName}
              {project.is_priority && <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />}
            </h1>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Created {format(new Date(project.created_at), 'MMM d, yyyy')}
            {allJobs.length > 0 && ` · ${allJobs.length} print job${allJobs.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button onClick={cancelEdit} className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <Button onClick={saveEdit} loading={updateMutation.isPending}>
                <Check className="h-3.5 w-3.5" /> Save
              </Button>
            </>
          ) : (
            <>
              <button onClick={startEdit}
                className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              {showDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Delete project?</span>
                  <button onClick={() => deleteMutation.mutate()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">
                    {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button onClick={() => setShowDelete(false)} className="text-gray-500 hover:text-gray-300">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowDelete(true)}
                  className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 hover:border-red-700 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Project Overview Card ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-border bg-surface-1 p-5 space-y-4">

        {/* Description */}
        <div>
          {editing ? (
            <textarea
              value={editForm.description ?? ''}
              onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value || null }))}
              placeholder="Description…"
              rows={3}
              className="w-full resize-none rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
            />
          ) : project.description ? (
            <p className="text-sm text-gray-200 leading-relaxed">{project.description}</p>
          ) : (
            <p className="text-sm text-gray-600 italic">No description</p>
          )}
        </div>

        {/* Status + Client row */}
        <div className="flex flex-wrap items-start gap-6 pt-1 border-t border-surface-border">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Status</p>
            {editing ? (
              <StatusPicker
                value={editForm.status ?? null}
                onChange={(v) => setEditForm((p) => ({ ...p, status: v }))}
              />
            ) : (
              <StatusChip status={project.status} />
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Client</p>
            {editing ? (
              <input
                value={editForm.client_requestor ?? ''}
                onChange={(e) => setEditForm((p) => ({ ...p, client_requestor: e.target.value || null }))}
                placeholder="Client name…"
                className="rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
              />
            ) : (
              <p className="text-sm text-gray-200">{project.client_requestor ?? <span className="text-gray-500">No Client</span>}</p>
            )}
          </div>
        </div>

        {/* Other metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1 border-t border-surface-border">
          {/* Priority */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Priority</p>
            {editing ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setEditForm((p) => ({ ...p, is_priority: !(p.is_priority ?? project.is_priority) }))}
                  className={cn('flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
                    (editForm.is_priority ?? project.is_priority) ? 'border-primary-500 bg-primary-500' : 'border-surface-border bg-surface-2')}
                >
                  {(editForm.is_priority ?? project.is_priority) && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="text-sm text-gray-300">High Priority</span>
              </label>
            ) : (
              project.is_priority
                ? <span className="flex items-center gap-1 text-amber-400 text-sm"><Star className="h-3.5 w-3.5 fill-amber-400" /> Priority</span>
                : <span className="text-sm text-gray-600">—</span>
            )}
          </div>

          {/* Designer */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Designer</p>
            {editing ? (
              <input
                value={editForm.designer ?? ''}
                onChange={(e) => setEditForm((p) => ({ ...p, designer: e.target.value || null }))}
                placeholder="Designer name…"
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-2 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
              />
            ) : (
              <p className="text-sm text-gray-200 flex items-center gap-1.5">
                {project.designer ? <><User className="h-3 w-3 text-gray-500" />{project.designer}</> : <span className="text-gray-600">—</span>}
              </p>
            )}
          </div>

          {/* Design Link */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Design Link</p>
            {editing ? (
              <input
                type="url"
                value={editForm.design_link ?? ''}
                onChange={(e) => setEditForm((p) => ({ ...p, design_link: e.target.value || null }))}
                placeholder="https://…"
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-2 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
              />
            ) : project.design_link ? (
              <a href={project.design_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 transition-colors truncate">
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{project.design_link.replace(/^https?:\/\//, '')}</span>
              </a>
            ) : (
              <span className="text-sm text-gray-600">—</span>
            )}
          </div>

          {/* Total print time */}
          {(project.estimated_print_time_seconds || totalTime > 0) && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Est. Print Time</p>
              <p className="text-sm text-gray-200 flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-gray-500" />
                {fmtTime(totalTime || project.estimated_print_time_seconds || 0)}
              </p>
            </div>
          )}

          {/* Total weight */}
          {totalWeight > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Total Weight</p>
              <p className="text-sm text-gray-200 flex items-center gap-1.5">
                <Package className="h-3 w-3 text-gray-500" />
                {totalWeight.toFixed(2)} g
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Nested Prints ───────────────────────────────────────────────────── */}
      {plates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary-400" />
            Nested Prints
            <span className="text-xs text-gray-500 font-normal">{plates.length} plate{plates.length !== 1 ? 's' : ''}</span>
          </h2>
          {plates.map((plate) => (
            <PlateCard
              key={plate.index}
              plate={plate}
              editing={editing}
              onUpdate={(patch) => patchPlate(plate.index, patch)}
            />
          ))}
        </div>
      )}

      {/* ── Material Cost Analysis ──────────────────────────────────────────── */}
      <MaterialCostSection plates={plates} />

      {/* ── Comments ────────────────────────────────────────────────────────── */}
      <CommentsSection
        projectId={projectId}
        comments={project.comments ?? []}
        onSave={saveComments}
      />

      {/* ── Print Jobs summary ──────────────────────────────────────────────── */}
      {allJobs.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface-1 overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
            <PrinterIcon className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-white">Print Jobs</h3>
            <span className="ml-auto text-xs text-gray-500">{allJobs.length}</span>
          </div>
          <div className="divide-y divide-surface-border">
            {allJobs.slice(0, 10).map((job) => (
              <div key={job.id} className="flex items-center gap-3 px-5 py-3">
                <div className={cn('h-2 w-2 shrink-0 rounded-full',
                  job.outcome === 'success' ? 'bg-emerald-500' :
                  job.outcome === 'failed'  ? 'bg-red-500' : 'bg-yellow-500')} />
                <span className="text-sm text-gray-200 flex-1 truncate">
                  {job.file_name ?? `Job #${job.id}`}
                </span>
                {job.duration_seconds && (
                  <span className="text-xs text-gray-500 tabular-nums shrink-0">
                    {formatDuration(job.duration_seconds)}
                  </span>
                )}
                <span className="text-xs text-gray-600 shrink-0">
                  {format(new Date(job.finished_at), 'MMM d')}
                </span>
              </div>
            ))}
            {allJobs.length > 10 && (
              <p className="px-5 py-3 text-xs text-gray-500 text-center">
                +{allJobs.length - 10} more jobs
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
