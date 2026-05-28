import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, ArrowLeft, Sparkles, Copy, Upload, Layers,
  Check, Plus, Trash2, FileUp, Download,
} from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { printJobsApi } from '@/api/print-jobs'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import type { ProjectResponse, PlateDatum } from '@/types/api'
import {
  BUILTIN_STATUSES, CUSTOM_STATUSES_KEY,
  getCustomStatuses, saveCustomStatuses,
} from './projectStatuses'
import type { StatusEntry } from './projectStatuses'

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjectType = 'scratch' | 'template' | 'file' | 'multi'
type WizardStep = 'type' | 'pick-template' | 'upload' | 'details' | 'multi-name' | 'multi-parts'

const STEPS_BY_TYPE: Record<ProjectType, WizardStep[]> = {
  scratch:  ['type', 'details'],
  template: ['type', 'pick-template', 'details'],
  file:     ['type', 'upload', 'details'],
  multi:    ['type', 'multi-name', 'multi-parts'],
}

const COMMON_MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'HIPS', 'PVA', 'Other']

interface FilamentRow {
  id: string
  color_hex: string
  material: string
  amount_g: string
}

interface ProjectForm {
  name: string
  description: string
  status: string | null
  clientRequestor: string
  designLink: string
  isPriority: boolean
  designer: string
  estimatedPrintTimeSeconds: number | null
  filamentRows: FilamentRow[]
  plateData: PlateDatum[]
}

const EMPTY_FORM: ProjectForm = {
  name: '', description: '', status: null, clientRequestor: '',
  designLink: '', isPriority: false, designer: '',
  estimatedPrintTimeSeconds: null, filamentRows: [], plateData: [],
}

// ── Native ZIP reader (no external dependency) ────────────────────────────────

async function readZipEntry(file: File, entryPath: string): Promise<string | null> {
  const buf   = await file.arrayBuffer()
  const view  = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const dec   = new TextDecoder()

  // Locate End of Central Directory (signature 0x06054b50, scanned from end)
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd === -1) return null

  const cdOffset = view.getUint32(eocd + 16, true)
  const cdSize   = view.getUint32(eocd + 12, true)

  // Walk Central Directory entries
  let pos = cdOffset
  while (pos < cdOffset + cdSize) {
    if (view.getUint32(pos, true) !== 0x02014b50) break   // central dir signature

    const method       = view.getUint16(pos + 10, true)
    const compSize     = view.getUint32(pos + 20, true)
    const fnLen        = view.getUint16(pos + 28, true)
    const extraLen     = view.getUint16(pos + 30, true)
    const commentLen   = view.getUint16(pos + 32, true)
    const localOffset  = view.getUint32(pos + 42, true)
    const name         = dec.decode(bytes.slice(pos + 46, pos + 46 + fnLen))

    if (name === entryPath || name === entryPath.replace(/^\//, '')) {
      // Read local file header to find data start
      const lhFnLen    = view.getUint16(localOffset + 26, true)
      const lhExtraLen = view.getUint16(localOffset + 28, true)
      const dataStart  = localOffset + 30 + lhFnLen + lhExtraLen
      const compressed = bytes.slice(dataStart, dataStart + compSize)

      if (method === 0) {
        return dec.decode(compressed)
      }
      if (method === 8) {
        const ds     = new DecompressionStream('deflate-raw')
        const writer = ds.writable.getWriter()
        writer.write(compressed)
        writer.close()
        const reader = ds.readable.getReader()
        const chunks: Uint8Array[] = []
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
        let off = 0
        for (const c of chunks) { out.set(c, off); off += c.length }
        return dec.decode(out)
      }
      return null
    }

    pos += 46 + fnLen + extraLen + commentLen
  }
  return null
}

// ── 3MF metadata extractor ────────────────────────────────────────────────────

function xmlMeta(doc: Document, name: string): string | null {
  for (const el of doc.getElementsByTagName('metadata')) {
    if (el.getAttribute('name') === name) return el.textContent?.trim() ?? null
  }
  return null
}

function decodeHtmlEntities(s: string): string {
  const txt = document.createElement('textarea')
  txt.innerHTML = s.replace(/&amp;/g, '&')
  const once = txt.value
  txt.innerHTML = once
  return txt.value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

async function parseProjectFile(file: File): Promise<Partial<ProjectForm> & { estimatedPrintTimeSeconds?: number | null; plateData?: PlateDatum[] }> {
  const baseName = file.name.replace(/\.(3mf|stl)$/i, '').replace(/[-_]+/g, ' ').trim()
  const fallback = baseName.charAt(0).toUpperCase() + baseName.slice(1)

  if (!file.name.toLowerCase().endsWith('.3mf')) return { name: fallback }

  try {
    const xmlParser = new DOMParser()

    // ── 3D/3dmodel.model ──────────────────────────────────────────────────────
    let name = fallback, description = '', designer = '', designLink = ''

    const modelXml = await readZipEntry(file, '3D/3dmodel.model')
    if (modelXml) {
      const doc   = xmlParser.parseFromString(modelXml, 'application/xml')
      const title = xmlMeta(doc, 'Title')
      if (title) name = title

      const rawDesc = xmlMeta(doc, 'Description') ?? xmlMeta(doc, 'ProfileDescription')
      if (rawDesc) description = decodeHtmlEntities(rawDesc)

      designer = xmlMeta(doc, 'Designer') ?? xmlMeta(doc, 'ProfileUserName') ?? ''

      const cr = xmlMeta(doc, 'CopyRight')
      if (cr) {
        try {
          // BambuStudio wraps the JSON array in an extra string layer: '"[{...}]"'
          let parsed: unknown = JSON.parse(cr)
          if (typeof parsed === 'string') parsed = JSON.parse(parsed)
          if (Array.isArray(parsed)) {
            const items = parsed as { link?: string; homepage?: string }[]
            designLink = items[0]?.link ?? items[0]?.homepage ?? ''
          }
        } catch { /* malformed JSON — ignore */ }
      }
    }

    // ── Metadata/slice_info.config ────────────────────────────────────────────
    let estimatedPrintTimeSeconds: number | null = null
    const filamentMap = new Map<string, FilamentRow>()
    const plateData: PlateDatum[] = []

    const sliceXml = await readZipEntry(file, 'Metadata/slice_info.config')
    if (sliceXml) {
      const doc = xmlParser.parseFromString(sliceXml, 'application/xml')

      for (const plate of doc.getElementsByTagName('plate')) {
        let plateIndex = 0, predSecs = 0, weightG = 0
        const objects: string[] = []
        const filaments: PlateDatum['filaments'] = []

        for (const el of plate.getElementsByTagName('metadata')) {
          const key = el.getAttribute('key')
          const val = el.getAttribute('value') ?? ''
          if (key === 'index')      plateIndex = parseInt(val, 10)
          if (key === 'prediction') predSecs   = parseInt(val, 10)
          if (key === 'weight')     weightG    = parseFloat(val)
        }
        for (const el of plate.getElementsByTagName('object')) {
          const n = el.getAttribute('name')
          if (n) objects.push(n)
        }
        for (const el of plate.getElementsByTagName('filament')) {
          const type  = el.getAttribute('type')   ?? 'PLA'
          const color = el.getAttribute('color')  ?? '#ffffff'
          const usedG = parseFloat(el.getAttribute('used_g') ?? '0')
          filaments.push({ type, color, used_g: usedG })

          // also aggregate for project-level filament estimates
          const key = `${type}|${color}`
          if (filamentMap.has(key)) {
            const row = filamentMap.get(key)!
            row.amount_g = (parseFloat(row.amount_g || '0') + usedG).toFixed(2)
          } else {
            filamentMap.set(key, { id: Math.random().toString(36).slice(2), color_hex: color, material: type, amount_g: usedG.toFixed(2) })
          }
        }

        plateData.push({ index: plateIndex, prediction_seconds: predSecs, weight_g: weightG, objects, filaments, status: null, printer_id: null, notes: null })
        estimatedPrintTimeSeconds = (estimatedPrintTimeSeconds ?? 0) + predSecs
      }
    }

    return { name, description, designer, designLink, estimatedPrintTimeSeconds, filamentRows: [...filamentMap.values()], plateData }
  } catch {
    return { name: fallback }
  }
}

function newRow(): FilamentRow {
  return { id: Math.random().toString(36).slice(2), color_hex: '#ffffff', material: 'PLA', amount_g: '' }
}

// ── ProgressDots ─────────────────────────────────────────────────────────────

function ProgressDots({ steps, current }: { steps: WizardStep[]; current: WizardStep }) {
  const contentSteps = steps.slice(1)
  const currentIdx = steps.indexOf(current)
  return (
    <div className="flex items-center gap-1.5">
      {contentSteps.map((_, i) => {
        const idx = i + 1
        return (
          <div key={i} className={cn(
            'rounded-full transition-all duration-200',
            currentIdx > idx  ? 'h-2 w-2 bg-primary-500' :
            currentIdx === idx ? 'h-2 w-5 bg-primary-500' :
                                 'h-2 w-2 bg-surface-3',
          )} />
        )
      })}
    </div>
  )
}

// ── Step: Type ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { type: ProjectType; icon: React.ReactNode; title: string; subtitle: string; color: string }[] = [
  { type: 'scratch',  icon: <Sparkles className="h-5 w-5 text-primary-400" />, title: 'From Scratch',         subtitle: 'Start with a blank project and customize everything', color: 'bg-primary-500/15' },
  { type: 'template', icon: <Copy     className="h-5 w-5 text-blue-400" />,    title: 'Using Template',        subtitle: 'Copy settings from an existing project',              color: 'bg-blue-500/15'    },
  { type: 'file',     icon: <FileUp   className="h-5 w-5 text-orange-400" />,  title: 'From 3MF / STL File',  subtitle: 'Import from a file with filament usage data',          color: 'bg-orange-500/15'  },
  { type: 'multi',    icon: <Layers   className="h-5 w-5 text-emerald-400" />, title: 'Multi-print Project',  subtitle: 'Multiple individual prints in one project',            color: 'bg-emerald-500/15' },
]

function StepType({ onSelect }: { onSelect: (t: ProjectType) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">Choose how you'd like to start your new project.</p>
      <div className="space-y-2">
        {TYPE_OPTIONS.map((opt) => (
          <button key={opt.type} onClick={() => onSelect(opt.type)}
            className="flex w-full items-center gap-4 rounded-xl border border-surface-border bg-surface-2 px-4 py-3.5 text-left hover:border-primary-500/50 hover:bg-surface-3 transition-colors group"
          >
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', opt.color)}>
              {opt.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{opt.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.subtitle}</p>
            </div>
            <ArrowLeft className="h-4 w-4 text-gray-600 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step: Pick Template ───────────────────────────────────────────────────────

function StepPickTemplate({ selected, onSelect }: { selected: ProjectResponse | null; onSelect: (p: ProjectResponse) => void }) {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">Choose a template</p>
        <p className="text-xs text-gray-500 mt-0.5">Your new project will start with the same settings.</p>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 rounded-xl bg-surface-2 animate-pulse" />)}</div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-2 py-8 text-center">
          <p className="text-sm text-gray-500">No existing projects to use as templates yet.</p>
          <p className="text-xs text-gray-600 mt-1">Create your first project from scratch first.</p>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
          {projects.map((p) => {
            const sel = selected?.id === p.id
            return (
              <button key={p.id} onClick={() => onSelect(p)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                  sel ? 'border-primary-500 bg-primary-600/20' : 'border-surface-border bg-surface-2 hover:border-gray-500 hover:bg-surface-3',
                )}
              >
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', sel ? 'bg-primary-600/30' : 'bg-surface-3')}>
                  {sel ? <Check className="h-4 w-4 text-primary-400" /> : <Copy className="h-4 w-4 text-gray-500" />}
                </div>
                <div>
                  <p className={cn('text-sm font-medium', sel ? 'text-white' : 'text-gray-200')}>{p.name}</p>
                  {p.status && <p className="text-[11px] text-gray-500 mt-0.5">{p.status}</p>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Step: Upload File ─────────────────────────────────────────────────────────

function StepUpload({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  function handleFile(f: File) { if (f.name.match(/\.(3mf|stl)$/i)) onFile(f) }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">Upload your file</p>
        <p className="text-xs text-gray-500 mt-0.5">We'll extract the project name and filament data where available.</p>
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors',
          dragOver ? 'border-primary-500 bg-primary-500/10' :
          file ? 'border-primary-500/60 bg-primary-500/5' :
          'border-surface-border bg-surface-2 hover:border-gray-500',
        )}
      >
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', file ? 'bg-primary-600/20' : 'bg-surface-3')}>
          <Upload className={cn('h-6 w-6', file ? 'text-primary-400' : 'text-gray-500')} />
        </div>
        {file ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-white">{file.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB · ready to import</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-gray-300">Drop your file here, or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">.3mf and .stl files supported</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".3mf,.stl" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>
      {file && (
        <div className="flex items-center gap-4">
          <a
            href={URL.createObjectURL(file)}
            download={file.name}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Download file
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); onFile(null) }}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Remove file
          </button>
        </div>
      )}
    </div>
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
          const selected = value === s.name
          return (
            <button key={s.name}
              onClick={() => onChange(selected ? null : s.name)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                selected
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-surface-border bg-surface-2 text-gray-400 hover:border-gray-500 hover:text-gray-200',
              )}
              style={selected ? { backgroundColor: s.color, borderColor: s.color } : undefined}
            >
              {selected && <Check className="h-3 w-3" />}
              {s.name}
            </button>
          )
        })}
        {!addingNew && (
          <button onClick={() => setAddingNew(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-surface-border px-3 py-1 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors"
          >
            <Plus className="h-3 w-3" /> Add new
          </button>
        )}
      </div>

      {addingNew && (
        <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-2 p-2.5">
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
            className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAddingNew(false) }}
            placeholder="Status name…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
          />
          <button onClick={handleAdd}
            className="rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-500 transition-colors">
            Add
          </button>
          <button onClick={() => setAddingNew(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── FilamentEstimatesBuilder ──────────────────────────────────────────────────

function FilamentEstimatesBuilder({ rows, onChange }: { rows: FilamentRow[]; onChange: (rows: FilamentRow[]) => void }) {
  function updateRow(id: string, patch: Partial<FilamentRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-2 p-2">
          <input type="color" value={row.color_hex}
            onChange={(e) => updateRow(row.id, { color_hex: e.target.value })}
            className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
          />
          <select value={row.material} onChange={(e) => updateRow(row.id, { material: e.target.value })}
            className="flex-1 min-w-0 rounded-lg border border-surface-border bg-surface-3 px-2 py-1.5 text-xs text-white focus:border-primary-500 focus:outline-none"
          >
            {COMMON_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            type="number" min="0" step="1"
            value={row.amount_g}
            onChange={(e) => updateRow(row.id, { amount_g: e.target.value })}
            placeholder="grams"
            className="w-20 shrink-0 rounded-lg border border-surface-border bg-surface-3 px-2 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
          />
          <button onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            className="shrink-0 text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, newRow()])}
        className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
        <Plus className="h-3.5 w-3.5" /> Add filament color
      </button>
    </div>
  )
}

// ── PrintTimeInput ────────────────────────────────────────────────────────────

function PrintTimeInput({ seconds, onChange }: { seconds: number | null; onChange: (v: number | null) => void }) {
  const hours   = seconds != null ? Math.floor(seconds / 3600)        : ''
  const minutes = seconds != null ? Math.floor((seconds % 3600) / 60) : ''

  function recalc(h: string, m: string) {
    const hv = parseInt(h, 10) || 0
    const mv = parseInt(m, 10) || 0
    if (!h && !m) { onChange(null); return }
    onChange(hv * 3600 + mv * 60)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 flex-1">
        <input
          type="number" min="0" placeholder="0"
          value={hours}
          onChange={(e) => recalc(e.target.value, String(minutes))}
          className="w-20 rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none tabular-nums"
        />
        <span className="text-xs text-gray-500 shrink-0">hr</span>
      </div>
      <div className="flex items-center gap-1.5 flex-1">
        <input
          type="number" min="0" max="59" placeholder="0"
          value={minutes}
          onChange={(e) => recalc(String(hours), e.target.value)}
          className="w-20 rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none tabular-nums"
        />
        <span className="text-xs text-gray-500 shrink-0">min</span>
      </div>
      {seconds != null && (
        <button onClick={() => onChange(null)} className="text-gray-600 hover:text-gray-400 transition-colors shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Step: Details (shared by scratch/template/file) ───────────────────────────

function StepDetails({
  form, onChange, clientSuggestions,
}: {
  form: ProjectForm
  onChange: (patch: Partial<ProjectForm>) => void
  clientSuggestions: string[]
}) {
  return (
    <div className="space-y-5 overflow-y-auto max-h-[62vh] pr-1">

      {/* Name */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Project Name <span className="text-red-400 normal-case not-italic">*</span>
        </label>
        <input
          autoFocus
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Voron 2.4, Gridfinity wall…"
          className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Description <span className="text-gray-600 normal-case font-normal">optional</span>
        </label>
        <textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="What is this project for?"
          rows={2}
          className="w-full resize-none rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Status <span className="text-gray-600 normal-case font-normal">optional</span>
        </label>
        <StatusPicker value={form.status} onChange={(v) => onChange({ status: v })} />
      </div>

      {/* Client / Requestor */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Client / Requestor <span className="text-gray-600 normal-case font-normal">optional</span>
        </label>
        <input
          list="wizard-client-list"
          value={form.clientRequestor}
          onChange={(e) => onChange({ clientRequestor: e.target.value })}
          placeholder="Who is this for?"
          className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
        />
        <datalist id="wizard-client-list">
          {clientSuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      {/* Designer */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Designer <span className="text-gray-600 normal-case font-normal">optional</span>
        </label>
        <input
          value={form.designer}
          onChange={(e) => onChange({ designer: e.target.value })}
          placeholder="Designer or creator name"
          className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {/* Design Link */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Design Link <span className="text-gray-600 normal-case font-normal">optional</span>
        </label>
        <input
          type="url"
          value={form.designLink}
          onChange={(e) => onChange({ designLink: e.target.value })}
          placeholder="https://printables.com/model/…"
          className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {/* Estimated Print Time */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Estimated Print Time <span className="text-gray-600 normal-case font-normal">optional</span>
        </label>
        <PrintTimeInput
          seconds={form.estimatedPrintTimeSeconds}
          onChange={(v) => onChange({ estimatedPrintTimeSeconds: v })}
        />
      </div>

      {/* Priority */}
      <label className="flex cursor-pointer items-start gap-3 group">
        <div
          onClick={() => onChange({ isPriority: !form.isPriority })}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
            form.isPriority
              ? 'border-primary-500 bg-primary-500'
              : 'border-surface-border bg-surface-2 group-hover:border-gray-500',
          )}
        >
          {form.isPriority && <Check className="h-3 w-3 text-white" />}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-200">Priority Project</p>
          <p className="text-xs text-gray-500 mt-0.5">Mark this project as high priority</p>
        </div>
      </label>

      {/* Filament Estimates */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
          Filament Usage Estimates <span className="text-gray-600 normal-case font-normal">optional</span>
        </label>
        <FilamentEstimatesBuilder
          rows={form.filamentRows}
          onChange={(rows) => onChange({ filamentRows: rows })}
        />
      </div>

    </div>
  )
}

// ── Step: Multi-print Name ────────────────────────────────────────────────────

function StepMultiName({ name, onChange, onSubmit }: { name: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">Name your project</p>
        <p className="text-xs text-gray-500 mt-0.5">This is the overall project name. You'll add individual parts next.</p>
      </div>
      <input
        autoFocus
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSubmit() }}
        placeholder="e.g. Cosplay helmet, Drone frame…"
        className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
      />
    </div>
  )
}

// ── Step: Multi-print Parts ───────────────────────────────────────────────────

function StepMultiParts({ parts, onChange }: { parts: string[]; onChange: (parts: string[]) => void }) {
  function update(i: number, val: string) { onChange(parts.map((p, j) => (j === i ? val : p))) }
  function add() { onChange([...parts, '']) }
  function remove(i: number) { onChange(parts.filter((_, j) => j !== i)) }
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">Define the parts</p>
        <p className="text-xs text-gray-500 mt-0.5">List each individual print. Enter to add, Backspace on empty to remove.</p>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {parts.map((part, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-gray-400 tabular-nums">
              {i + 1}
            </div>
            <input
              autoFocus={i === parts.length - 1 && i > 0}
              value={part}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); add() }
                if (e.key === 'Backspace' && part === '' && parts.length > 1) { e.preventDefault(); remove(i) }
              }}
              placeholder={`Part ${i + 1} (e.g. Helmet shell, Face plate…)`}
              className="flex-1 rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none"
            />
            {parts.length > 1 && (
              <button onClick={() => remove(i)} className="shrink-0 text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
        <Plus className="h-3.5 w-3.5" /> Add another part
      </button>
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export function NewProjectWizard({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [type,    setType]    = useState<ProjectType | null>(null)
  const [step,    setStep]    = useState<WizardStep>('type')
  const [form,    setForm]    = useState<ProjectForm>(EMPTY_FORM)
  const [template, setTemplate] = useState<ProjectResponse | null>(null)
  const [file,    setFile]    = useState<File | null>(null)
  const [parts,   setParts]   = useState<string[]>([''])
  const [parsing, setParsing] = useState(false)
  const [error,   setError]   = useState('')

  const { data: allProjects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })

  const clientSuggestions = [...new Set(
    allProjects.map((p) => p.client_requestor).filter(Boolean) as string[]
  )]

  const steps     = type ? STEPS_BY_TYPE[type] : (['type'] as WizardStep[])
  const stepIndex = steps.indexOf(step)
  const isLast    = type !== null && stepIndex === steps.length - 1

  function patchForm(patch: Partial<ProjectForm>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function buildPayload() {
    const estimates = form.filamentRows
      .filter((r) => r.material || r.amount_g)
      .map((r) => ({
        color_name: null,
        color_hex:  r.color_hex || null,
        material:   r.material  || null,
        amount_g:   r.amount_g  ? parseFloat(r.amount_g) : null,
      }))

    let description = form.description.trim() || null
    if (type === 'multi' && parts.some((p) => p.trim())) {
      const list = parts.filter((p) => p.trim()).map((p, i) => `${i + 1}. ${p.trim()}`).join('\n')
      description = description ? `${description}\n\nParts:\n${list}` : `Parts:\n${list}`
    }

    return {
      name:                         form.name.trim(),
      description,
      status:                       form.status                 || null,
      client_requestor:             form.clientRequestor.trim() || null,
      design_link:                  form.designLink.trim()      || null,
      is_priority:                  form.isPriority,
      designer:                     form.designer.trim()        || null,
      estimated_print_time_seconds: form.estimatedPrintTimeSeconds,
      filament_estimates:           estimates.length ? estimates : null,
      plate_data:                   form.plateData.length ? form.plateData : null,
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const project = await projectsApi.create(buildPayload())

      // For file imports: auto-create a linked print job from the 3MF metadata
      if (type === 'file' && file) {
        await printJobsApi.create({
          project_id:       project.id,
          file_name:        file.name,
          duration_seconds: form.estimatedPrintTimeSeconds ?? undefined,
          outcome:          'success',
        })
      }

      return project
    },
    onSuccess: (project: ProjectResponse) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['print-jobs'] })
      onClose()
      navigate(`/print-jobs/projects/${project.id}`)
    },
    onError: () => setError('Failed to create project. Please try again.'),
  })

  function canAdvance(): boolean {
    switch (step) {
      case 'type':          return type !== null
      case 'pick-template': return template !== null
      case 'upload':        return file !== null
      case 'details':       return form.name.trim().length > 0
      case 'multi-name':    return form.name.trim().length > 0
      case 'multi-parts':   return parts.some((p) => p.trim().length > 0)
    }
  }

  async function handleNext() {
    setError('')
    if (isLast) { createMutation.mutate(); return }

    const next = steps[stepIndex + 1]
    if (!next) return

    if (step === 'upload' && file) {
      setParsing(true)
      try {
        const parsed = await parseProjectFile(file)
        patchForm({
          name:                      parsed.name                      ?? form.name,
          description:               parsed.description               ?? form.description,
          designer:                  parsed.designer                  ?? form.designer,
          designLink:                parsed.designLink                ?? form.designLink,
          estimatedPrintTimeSeconds: parsed.estimatedPrintTimeSeconds ?? form.estimatedPrintTimeSeconds,
          filamentRows:              parsed.filamentRows              ?? form.filamentRows,
          plateData:                 parsed.plateData                 ?? form.plateData,
        })
      } finally {
        setParsing(false)
      }
    }

    setStep(next)
  }

  function handleBack() {
    if (step === 'type') { onClose(); return }
    const prev = steps[stepIndex - 1]
    if (prev) setStep(prev)
  }

  function handleTypeSelect(t: ProjectType) {
    setType(t)
    setStep(STEPS_BY_TYPE[t][1])
  }

  function handleTemplateSelect(p: ProjectResponse) {
    setTemplate(p)
    patchForm({
      name:                      `Copy of ${p.name}`,
      description:               p.description     ?? '',
      status:                    p.status,
      clientRequestor:           p.client_requestor ?? '',
      designLink:                p.design_link      ?? '',
      isPriority:                p.is_priority,
      designer:                  p.designer         ?? '',
      estimatedPrintTimeSeconds: p.estimated_print_time_seconds ?? null,
      plateData: p.plate_data ?? [],
      filamentRows:    p.filament_estimates.map((e) => ({
        id:       Math.random().toString(36).slice(2),
        color_hex: e.color_hex ?? '#ffffff',
        material:  e.material  ?? 'PLA',
        amount_g:  e.amount_g?.toString() ?? '',
      })),
    })
  }

  const stepTitles: Record<WizardStep, string> = {
    'type':          'New Project',
    'pick-template': 'Choose Template',
    'upload':        'Upload File',
    'details':       'Project Details',
    'multi-name':    'Project Name',
    'multi-parts':   'Define Parts',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div className="flex items-center gap-2">
            {step !== 'type' && (
              <button onClick={handleBack}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-base font-semibold text-white">{stepTitles[step]}</h2>
          </div>
          <div className="flex items-center gap-3">
            {type && step !== 'type' && <ProgressDots steps={steps} current={step} />}
            <button onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === 'type' && <StepType onSelect={handleTypeSelect} />}

          {step === 'pick-template' && (
            <StepPickTemplate selected={template} onSelect={handleTemplateSelect} />
          )}

          {step === 'upload' && <StepUpload file={file} onFile={setFile} />}

          {step === 'details' && (
            <StepDetails form={form} onChange={patchForm} clientSuggestions={clientSuggestions} />
          )}

          {step === 'multi-name' && (
            <StepMultiName name={form.name} onChange={(v) => patchForm({ name: v })} onSubmit={handleNext} />
          )}

          {step === 'multi-parts' && (
            <StepMultiParts parts={parts} onChange={setParts} />
          )}

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        {step !== 'type' && (
          <div className="flex items-center justify-between border-t border-surface-border px-5 py-4">
            <button onClick={handleBack} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              ← Back
            </button>
            <Button
              disabled={!canAdvance()}
              loading={createMutation.isPending || parsing}
              onClick={handleNext}
            >
              {isLast ? 'Create project' : 'Continue →'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
