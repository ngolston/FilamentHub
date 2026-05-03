import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, ChevronDown, ChevronRight, Upload, X, Plus, Check, Link2,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { filamentsApi } from '@/api/filaments'
import { brandsApi } from '@/api/brands'
import { locationsApi } from '@/api/locations'
import { printersApi } from '@/api/printers'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import type { FilamentProfileResponse, BrandResponse, LocationResponse, SpoolResponse, SpoolStatus, PrinterResponse } from '@/types/api'

// ── Assignment types ──────────────────────────────────────────────────────────
type SlotAssignment =
  | { type: 'ams'; printerId: number; unitId: number; slotIndex: number }
  | { type: 'direct'; printerId: number }
  | null

// ── Constants ─────────────────────────────────────────────────────────────────

const MATERIALS = [
  'PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC',
  'PLA-CF', 'PETG-CF', 'Silk', 'Matte', 'Wood fill', 'Other',
]

const WEIGHT_PRESETS = [250, 500, 750, 1000, 2000]

const COLOR_PRESETS = [
  { label: 'Red',    hex: '#EF4444' },
  { label: 'Orange', hex: '#F97316' },
  { label: 'Yellow', hex: '#EAB308' },
  { label: 'Green',  hex: '#22C55E' },
  { label: 'Cyan',   hex: '#06B6D4' },
  { label: 'Blue',   hex: '#3B82F6' },
  { label: 'Indigo', hex: '#6366F1' },
  { label: 'Purple', hex: '#A855F7' },
  { label: 'Pink',   hex: '#EC4899' },
  { label: 'White',  hex: '#F8FAFC' },
  { label: 'Black',  hex: '#0F172A' },
  { label: 'Gray',   hex: '#6B7280' },
  { label: 'Gold',   hex: '#F59E0B' },
  { label: 'Silver', hex: '#94A3B8' },
]

const STATUSES: { value: SpoolStatus; label: string; color: string; desc: string }[] = [
  { value: 'active',   label: 'Active',   color: 'bg-emerald-600', desc: 'In use or loaded' },
  { value: 'storage',  label: 'Storage',  color: 'bg-cyan-600',    desc: 'On shelf, ready to load' },
  { value: 'archived', label: 'Archived', color: 'bg-gray-600',    desc: 'Retired, analytics only' },
]

// ── Zod schema ────────────────────────────────────────────────────────────────

const schema = z.object({
  brand_id:       z.coerce.number().optional(),
  filament_id:    z.coerce.number().optional(),
  material:       z.string().min(1, 'Material is required'),
  diameter:       z.number().default(1.75),
  color_name:     z.string().optional(),
  color_hex:      z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid 6-digit hex code')
    .optional()
    .or(z.literal('')),
  initial_weight: z.coerce.number().positive('Initial weight is required'),
  spool_weight:   z.coerce.number().min(0).optional(),
  used_weight:    z.coerce.number().min(0).default(0),
  location_id:    z.coerce.number().optional(),
  supplier:            z.string().optional(),
  product_url:         z.string().url('Must be a valid URL').optional().or(z.literal('')),
  purchase_date:       z.string().optional(),
  extra_color_hex_2:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
  extra_color_hex_3:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
  extra_color_hex_4:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
  purchase_price: z.coerce.number().min(0).optional(),
  name:           z.string().optional(),
  lot_nr:         z.string().optional(),
  notes:          z.string().optional(),
})

type FormData = z.infer<typeof schema>

// ── SmartDropdown ─────────────────────────────────────────────────────────────

interface SmartDropdownProps<T extends { id: number; name: string }> {
  label:       string
  items:       T[]
  value:       number | undefined
  onChange:    (id: number | undefined, item: T | undefined) => void
  placeholder?: string
  onAddNew?:   (name: string) => Promise<T>
  addLabel?:   string
  renderItem?: (item: T) => React.ReactNode
}

function SmartDropdown<T extends { id: number; name: string }>({
  label, items, value, onChange, placeholder, onAddNew, addLabel, renderItem,
}: SmartDropdownProps<T>) {
  const [open, setOpen]           = useState(false)
  const [search, setSearch]       = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName]     = useState('')
  const [creating, setCreating]   = useState(false)
  const [addError, setAddError]   = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = items.find((i) => i.id === value)
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setAddingNew(false); setSearch(''); setAddError('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleAdd() {
    if (!onAddNew || !newName.trim()) return
    setCreating(true)
    setAddError('')
    try {
      const item = await onAddNew(newName.trim())
      onChange(item.id, item); setNewName(''); setAddingNew(false); setOpen(false); setSearch('')
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to create — please try again.')
    } finally { setCreating(false) }
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch('') }}
        className="flex items-center justify-between w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-left focus:border-primary-500 focus:outline-none"
      >
        <span className={selected ? 'text-white' : 'text-gray-500'}>
          {selected ? selected.name : (placeholder ?? `Select ${label.toLowerCase()}…`)}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 rounded-xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-surface-border">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>
          <button type="button" onClick={() => { onChange(undefined, undefined); setOpen(false) }}
            className={`w-full px-3 py-2 text-left text-sm transition-colors ${!value ? 'text-primary-300 bg-primary-900/20' : 'text-gray-400 hover:bg-surface-2'}`}>
            <span className="italic">— None —</span>
          </button>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((item) => (
              <button key={item.id} type="button" onClick={() => { onChange(item.id, item); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${value === item.id ? 'bg-primary-600/20 text-white' : 'text-gray-300 hover:bg-surface-2 hover:text-white'}`}>
                {renderItem ? renderItem(item) : item.name}
                {value === item.id && <Check className="ml-auto h-3.5 w-3.5 text-primary-400 shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && !addingNew && <p className="px-3 py-3 text-sm text-gray-500 text-center">No matches</p>}
          </div>
          {onAddNew && (
            <div className="border-t border-surface-border">
              {!addingNew ? (
                <button type="button" onClick={() => setAddingNew(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-400 hover:bg-surface-2 hover:text-primary-300 transition-colors">
                  <Plus className="h-3.5 w-3.5" />{addLabel ?? `Add new ${label.toLowerCase()}`}
                </button>
              ) : (
                <div className="p-2 space-y-1.5">
                  <div className="flex gap-2">
                    <input autoFocus value={newName}
                      onChange={(e) => { setNewName(e.target.value); setAddError('') }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                      placeholder={`${label} name…`}
                      className={`flex-1 rounded-lg border bg-surface-2 px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500 ${addError ? 'border-red-500' : 'border-surface-border'}`}
                    />
                    <button type="button" disabled={!newName.trim() || creating} onClick={handleAdd}
                      className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-500 disabled:opacity-50">
                      {creating ? '…' : 'Add'}
                    </button>
                    <button type="button" onClick={() => { setAddingNew(false); setNewName(''); setAddError('') }}
                      className="rounded-lg px-2 py-1.5 text-gray-400 hover:text-white hover:bg-surface-2">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {addError && <p className="text-xs text-red-400 px-1">{addError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SelectedTag ───────────────────────────────────────────────────────────────

function SelectedTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-700/50 bg-primary-900/25 pl-3 pr-1.5 py-1 text-xs font-medium text-primary-300">
        {label}
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 hover:bg-primary-700/40 hover:text-white transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </div>
  )
}

// ── StringSmartDropdown ───────────────────────────────────────────────────────

function StringSmartDropdown({
  label, items, value, onChange, placeholder, addLabel,
}: {
  label:        string
  items:        string[]
  value:        string | undefined
  onChange:     (v: string | undefined) => void
  placeholder?: string
  addLabel?:    string
}) {
  const [open, setOpen]       = useState(false)
  const [search, setSearch]   = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = items.filter((s) => s.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setAddingNew(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleSelect(s: string) { onChange(s); setOpen(false); setSearch('') }
  function handleAdd() {
    const name = newName.trim() || search.trim()
    if (!name) return
    onChange(name); setNewName(''); setAddingNew(false); setOpen(false); setSearch('')
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch('') }}
        className="flex items-center justify-between w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-left focus:border-primary-500 focus:outline-none"
      >
        <span className={value ? 'text-white' : 'text-gray-500'}>
          {value ?? (placeholder ?? `Select ${label.toLowerCase()}…`)}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 rounded-xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-surface-border">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) handleSelect(search.trim()) }}
              placeholder={`Search or type ${label.toLowerCase()}…`}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>
          <button type="button" onClick={() => { onChange(undefined); setOpen(false) }}
            className={`w-full px-3 py-2 text-left text-sm transition-colors ${!value ? 'text-primary-300 bg-primary-900/20' : 'text-gray-400 hover:bg-surface-2'}`}>
            <span className="italic">— None —</span>
          </button>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((s) => (
              <button key={s} type="button" onClick={() => handleSelect(s)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${value === s ? 'bg-primary-600/20 text-white' : 'text-gray-300 hover:bg-surface-2 hover:text-white'}`}>
                {s}
                {value === s && <Check className="ml-auto h-3.5 w-3.5 text-primary-400 shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && !addingNew && (
              <p className="px-3 py-3 text-sm text-gray-500 text-center">
                {search ? `No match — hit Enter or click "+ Add" to use "${search}"` : 'No saved entries yet'}
              </p>
            )}
          </div>
          <div className="border-t border-surface-border">
            {!addingNew ? (
              <button type="button" onClick={() => { setAddingNew(true); setNewName(search) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-400 hover:bg-surface-2 hover:text-primary-300 transition-colors">
                <Plus className="h-3.5 w-3.5" />{addLabel ?? `Add "${search || '…'}" as new ${label.toLowerCase()}`}
              </button>
            ) : (
              <div className="p-2 flex gap-2">
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder={`${label} name…`}
                  className="flex-1 rounded-lg border border-surface-border bg-surface-2 px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500"
                />
                <button type="button" disabled={!newName.trim()} onClick={handleAdd}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-500 disabled:opacity-50">
                  Add
                </button>
                <button type="button" onClick={() => { setAddingNew(false); setNewName('') }}
                  className="rounded-lg px-2 py-1.5 text-gray-400 hover:text-white hover:bg-surface-2">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {value && (
        <SelectedTag label={value} onRemove={() => onChange(undefined)} />
      )}
    </div>
  )
}

// ── ColorPicker ───────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [customHex, setCustomHex] = useState(
    COLOR_PRESETS.some((c) => c.hex.toLowerCase() === value?.toLowerCase()) ? '' : (value ?? ''),
  )

  function handleCustom(raw: string) {
    const val = raw.startsWith('#') ? raw : `#${raw}`
    setCustomHex(raw)
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) onChange(val)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((c) => (
          <button key={c.hex} type="button" title={c.label} onClick={() => { setCustomHex(''); onChange(c.hex) }}
            className="h-7 w-7 rounded-full border-2 transition-all"
            style={{ backgroundColor: c.hex, borderColor: value?.toLowerCase() === c.hex.toLowerCase() ? '#fff' : 'transparent', boxShadow: value?.toLowerCase() === c.hex.toLowerCase() ? '0 0 0 1px #6366f1' : 'none' }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: value || '#6B7280' }} />
        <input type="text" value={customHex} onChange={(e) => handleCustom(e.target.value)}
          placeholder="#RRGGBB" maxLength={7}
          className="w-28 rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none font-mono"
        />
        <span className="text-xs text-gray-500">or enter custom hex</span>
      </div>
    </div>
  )
}

// ── PhotoDropzone ─────────────────────────────────────────────────────────────

function PhotoDropzone({
  file, onChange, existingUrl,
}: {
  file: File | null; onChange: (f: File | null) => void; existingUrl?: string | null
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleFile(f: File) { if (f.type.startsWith('image/')) onChange(f) }

  const displayUrl = preview ?? existingUrl ?? null

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  if (displayUrl) {
    return (
      <div className="space-y-2">
        <div className="relative w-full h-40 rounded-xl overflow-hidden border border-surface-border">
          <img src={displayUrl} alt="Spool photo" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white hover:bg-black transition-colors backdrop-blur-sm">
              Change photo
            </button>
            <button type="button" onClick={() => onChange(null)}
              className="rounded-full bg-black/70 p-1.5 text-white hover:bg-black transition-colors backdrop-blur-sm">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {file && (
          <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-2 px-3 py-2">
            <div className="h-8 w-8 shrink-0 rounded overflow-hidden">
              <img src={displayUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
            </div>
            <button type="button" onClick={() => onChange(null)} className="text-gray-500 hover:text-red-400 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>
    )
  }

  return (
    <div onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 h-36 w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors
        ${dragging ? 'border-primary-500 bg-primary-900/10' : 'border-surface-border hover:border-gray-600 bg-surface-2'}`}
    >
      <Upload className="h-7 w-7 text-gray-500" />
      <p className="text-sm text-gray-400">Drop a photo or <span className="text-primary-400">click to browse</span></p>
      <p className="text-xs text-gray-600">JPEG · PNG · WebP</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
    </div>
  )
}

// ── SpoolPreview ──────────────────────────────────────────────────────────────

interface PreviewProps {
  brandName:     string
  filamentName:  string
  material:      string
  colorHex:      string
  colorHex2?:    string
  colorHex3?:    string
  colorHex4?:    string
  diameter:      number
  initialWeight: number
  usedWeight:    number
  printTempMin?: number
  printTempMax?: number
}

function SpoolPreview({
  brandName, filamentName, material, colorHex, colorHex2: _colorHex2, colorHex3: _colorHex3, colorHex4: _colorHex4,
  diameter, initialWeight, usedWeight, printTempMin, printTempMax,
}: PreviewProps) {
  const remaining    = Math.max(0, (initialWeight || 0) - (usedWeight || 0))
  const pct          = initialWeight > 0 ? Math.min(100, (remaining / initialWeight) * 100) : 100
  const color        = /^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : '#6366F1'
  const r = 56, cx = 80, cy = 80, sw = 16
  const circumference = 2 * Math.PI * r
  const dashOffset    = circumference * (1 - pct / 100)
  const statusColor   = pct > 25 ? '#22c55e' : pct > 10 ? '#eab308' : '#ef4444'
  const statusLabel   = pct > 25 ? 'OK' : pct > 10 ? 'Low' : 'Critical'
  const displayName   = [brandName, filamentName].filter(Boolean).join(' ') || 'Unnamed spool'

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 p-5 flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Live Preview</p>
      <div className="flex justify-center">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx={cx} cy={cy} r={r + sw / 2 + 6} fill="none" stroke="#374151" strokeWidth={1.5} strokeDasharray="3 5" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={sw} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={String(circumference)} strokeDashoffset={String(dashOffset)}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.2s ease' }}
          />
          <circle cx={cx} cy={cy} r={22} fill="#111827" />
          <circle cx={cx} cy={cy} r={7} fill="#374151" />
          <circle cx={cx} cy={cy} r={3} fill="#1f2937" />
          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="system-ui">
            {pct.toFixed(0)}%
          </text>
        </svg>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-white leading-tight">{displayName}</p>
        <span className="inline-block rounded-full bg-surface-3 px-2.5 py-0.5 text-xs text-gray-300">{material || '—'}</span>
      </div>


      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-500">{remaining.toFixed(0)} g remaining</span>
          <span style={{ color: statusColor }}>{statusLabel}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full border border-surface-border px-2.5 py-0.5 text-xs text-gray-300">{diameter}mm</span>
        {(printTempMin || printTempMax) && (
          <span className="rounded-full border border-surface-border px-2.5 py-0.5 text-xs text-gray-300">
            {printTempMin ?? '?'}–{printTempMax ?? '?'}°C
          </span>
        )}
        <span className="rounded-full border border-surface-border px-2.5 py-0.5 text-xs text-gray-300">{remaining.toFixed(0)} g</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
        <span className="text-xs text-gray-400">{statusLabel} · {pct.toFixed(0)}% remaining</span>
      </div>
    </div>
  )
}

// ── Section & FieldError ──────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      {children}
    </div>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-red-400 mt-0.5">{msg}</p>
}

// ── FilamentAutocomplete ──────────────────────────────────────────────────────

function FilamentAutocomplete({
  brandId, value, onChange, onSelect,
}: {
  brandId: number | undefined; value: string; onChange: (v: string) => void; onSelect: (fp: FilamentProfileResponse) => void
}) {
  const [open, setOpen]       = useState(false)
  const containerRef          = useRef<HTMLDivElement>(null)
  const { data } = useQuery({
    queryKey: ['filaments', 'autocomplete', brandId],
    queryFn:  () => filamentsApi.list({ brand_id: brandId, page_size: 200 }),
    enabled:  true,
  })
  const suggestions = (data?.items ?? []).filter((f) =>
    !value || f.name.toLowerCase().includes(value.toLowerCase()),
  )

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-300">Filament name</label>
      <input type="text" value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={brandId ? 'Search or type a filament name…' : 'Type a filament name…'}
        className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 max-h-48 overflow-y-auto rounded-xl border border-surface-border bg-surface-1 shadow-2xl">
          {suggestions.map((f) => (
            <button key={f.id} type="button"
              onClick={() => { onSelect(f); onChange(f.name); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors"
            >
              <div className="h-4 w-4 shrink-0 rounded-full border border-white/10" style={{ backgroundColor: f.color_hex ?? '#374151' }} />
              <span className="text-white truncate">{f.name}</span>
              <span className="text-xs text-gray-500 shrink-0">{f.material}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── URLPreview ────────────────────────────────────────────────────────────────

function URLPreview({ url }: { url: string }) {
  if (!url) return null
  try {
    const { hostname } = new URL(url)
    if (!hostname) return null
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <Link2 className="h-3 w-3 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-400">{hostname}</span>
      </div>
    )
  } catch { return null }
}

// ── PrintInfoRow ──────────────────────────────────────────────────────────────

function PrintInfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  )
}

// ── Printer assignment picker ─────────────────────────────────────────────────

function PrinterAssignmentPicker({
  printers,
  selectedPrinterId,
  assignment,
  onPrinterChange,
  onSlotSelect,
}: {
  printers: PrinterResponse[]
  selectedPrinterId: number | ''
  assignment: SlotAssignment
  onPrinterChange: (id: number | '') => void
  onSlotSelect: (a: SlotAssignment) => void
}) {
  const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null
  const sortedUnits = selectedPrinter
    ? [...selectedPrinter.ams_units].sort((a, b) => a.unit_index - b.unit_index)
    : []

  function isSelected(a: SlotAssignment): boolean {
    if (!assignment || !a) return false
    if (assignment.type !== a.type || assignment.printerId !== a.printerId) return false
    if (assignment.type === 'ams' && a.type === 'ams') {
      return assignment.unitId === a.unitId && assignment.slotIndex === a.slotIndex
    }
    return assignment.type === 'direct'
  }

  function toggle(a: SlotAssignment) {
    onSlotSelect(isSelected(a) ? null : a)
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-2/50 p-3 space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Printer assignment</p>

      {/* Printer picker */}
      <select
        value={selectedPrinterId}
        onChange={(e) => onPrinterChange(e.target.value ? Number(e.target.value) : '')}
        className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
      >
        <option value="">— None / unassigned —</option>
        {printers.map((p) => (
          <option key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
        ))}
      </select>

      {/* Slot grid */}
      {selectedPrinter && (
        <div className="space-y-2">
          {sortedUnits.map((unit, unitIdx) => {
            const letter = String.fromCharCode(65 + unitIdx)
            const slots = [...unit.slots].sort((a, b) => a.slot_index - b.slot_index)
            return (
              <div key={unit.id}>
                <p className="mb-1 text-xs text-gray-600">{unit.name}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.map((slot) => {
                    const slotLabel = `${letter}${slot.slot_index + 1}`
                    const a: SlotAssignment = { type: 'ams', printerId: selectedPrinter.id, unitId: unit.id, slotIndex: slot.slot_index }
                    const sel = isSelected(a)
                    const occupied = slot.spool_id !== null && !sel
                    return (
                      <button
                        key={slot.slot_index}
                        type="button"
                        disabled={occupied}
                        onClick={() => toggle(a)}
                        title={occupied ? `Occupied by spool #${slot.spool_id}` : slotLabel}
                        className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                          sel
                            ? 'border-primary-500 bg-primary-600 text-white'
                            : occupied
                              ? 'border-surface-border bg-surface-3 text-gray-600 cursor-not-allowed'
                              : 'border-surface-border bg-surface-2 text-gray-300 hover:border-primary-500/60 hover:text-white'
                        }`}
                      >
                        {slotLabel}
                        {occupied && <span className="block text-[9px] text-gray-600 font-normal">taken</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* External slot */}
          <div>
            <p className="mb-1 text-xs text-gray-600">External</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(() => {
                const a: SlotAssignment = { type: 'direct', printerId: selectedPrinter.id }
                const sel = isSelected(a)
                const occupied = selectedPrinter.direct_spool_id !== null && !sel
                return (
                  <button
                    type="button"
                    disabled={occupied}
                    onClick={() => toggle(a)}
                    title={occupied ? `Occupied by spool #${selectedPrinter.direct_spool_id}` : 'External 1'}
                    className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      sel
                        ? 'border-primary-500 bg-primary-600 text-white'
                        : occupied
                          ? 'border-surface-border bg-surface-3 text-gray-600 cursor-not-allowed'
                          : 'border-surface-border bg-surface-2 text-gray-300 hover:border-primary-500/60 hover:text-white'
                    }`}
                  >
                    Ext 1
                    {occupied && <span className="block text-[9px] text-gray-600 font-normal">taken</span>}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {assignment && (
        <p className="text-xs text-primary-400">
          {assignment.type === 'direct'
            ? `${selectedPrinter?.name ?? ''} · External 1`
            : (() => {
                const unitIdx = sortedUnits.findIndex((u) => u.id === (assignment as { unitId: number }).unitId)
                const letter = unitIdx >= 0 ? String.fromCharCode(65 + unitIdx) : '?'
                return `${selectedPrinter?.name ?? ''} · ${letter}${(assignment as { slotIndex: number }).slotIndex + 1}`
              })()
          }
        </p>
      )}
    </div>
  )
}

// ── SlotConflictDialog ────────────────────────────────────────────────────────

function SlotConflictDialog({
  targetLocation,
  occupyingSpool,
  loadingOccupier,
  locations,
  movePending,
  onKeep,
  onMove,
}: {
  targetLocation: LocationResponse
  occupyingSpool: SpoolResponse | null
  loadingOccupier: boolean
  locations: LocationResponse[]
  movePending: boolean
  onKeep: () => void
  onMove: (destLocationId: number | undefined) => void
}) {
  const [moveMode, setMoveMode] = useState(false)
  const [destId, setDestId]     = useState<string>('')

  const moveTargets = locations.filter((l) => l.id !== targetLocation.id)
  const spoolLabel  = occupyingSpool
    ? (occupyingSpool.name ?? occupyingSpool.filament?.name ?? occupyingSpool.filament?.material ?? `Spool #${occupyingSpool.id}`)
    : null

  function confirmMove() {
    if (!destId) return
    onMove(destId === '0' ? undefined : Number(destId))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onKeep} />
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Slot already occupied</h2>
          <button type="button" onClick={onKeep} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingOccupier ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-border border-t-primary-500" />
            Checking slot…
          </div>
        ) : (
          <p className="text-sm text-gray-300">
            <span className="font-medium text-white">{targetLocation.name}</span> is already occupied
            {spoolLabel ? <> by <span className="text-primary-300">{spoolLabel}</span></> : ' by another spool'}.
          </p>
        )}

        {!loadingOccupier && !moveMode && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onKeep}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-4 py-3 text-sm text-left text-gray-300 hover:bg-surface-3 hover:text-white transition-colors"
            >
              <span className="font-medium">Keep original spool in this slot</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">Don't change the location selection</span>
            </button>
            <button
              type="button"
              onClick={() => setMoveMode(true)}
              className="w-full rounded-lg border border-primary-700/40 bg-primary-900/20 px-4 py-3 text-sm text-left text-primary-300 hover:bg-primary-900/30 hover:text-primary-200 transition-colors"
            >
              <span className="font-medium">Move original spool to another location</span>
              <span className="block text-[11px] text-primary-500/80 mt-0.5">Then assign this slot to the current spool</span>
            </button>
          </div>
        )}

        {!loadingOccupier && moveMode && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Where should <span className="text-gray-300">{spoolLabel ?? 'the original spool'}</span> go?
            </p>
            <select
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
            >
              <option value="">— Select destination —</option>
              <option value="0">Unassign (no location)</option>
              {moveTargets.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}{loc.spool_count > 0 ? ` · ${loc.spool_count} spool${loc.spool_count !== 1 ? 's' : ''}` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => { setMoveMode(false); setDestId('') }}>
                Back
              </Button>
              <Button
                type="button"
                disabled={!destId || movePending}
                loading={movePending}
                onClick={confirmMove}
              >
                Confirm move
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EditSpoolPage() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  const [photo, setPhoto]                   = useState<File | null>(null)
  const [photoUrl, setPhotoUrl]             = useState('')
  const [colorHex, setColorHex]             = useState('#6366F1')
  const [colorHex2, setColorHex2]           = useState('')
  const [colorHex3, setColorHex3]           = useState('')
  const [colorHex4, setColorHex4]           = useState('')
  const [activeColorSlot, setActiveColorSlot] = useState<1|2|3|4>(1)
  const [status, setStatus]                 = useState<SpoolStatus>('storage')
  const [weightUnit, setWeightUnit]         = useState<'g' | 'kg'>('g')
  const [submitError, setSubmitError]       = useState('')
  const [selectedBrand, setSelectedBrand]   = useState<BrandResponse | undefined>()
  const [selectedLocation, setSelectedLocation] = useState<LocationResponse | undefined>()
  const [filamentName, setFilamentName]     = useState('')
  const [selectedFilament, setSelectedFilament] = useState<FilamentProfileResponse | undefined>()
  const [conflictSlot, setConflictSlot]     = useState<{
    targetLocation: LocationResponse
    occupyingSpool: SpoolResponse | null
    loading: boolean
  } | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: spool, isLoading: loadingSpool } = useQuery({
    queryKey: ['spools', id],
    queryFn:  () => spoolsApi.get(Number(id)),
    enabled:  !!id,
  })
  const { data: brands    = [] } = useQuery({ queryKey: ['brands'],    queryFn: () => brandsApi.list() })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list })
  const { data: printers  = [] } = useQuery({ queryKey: ['printers'],  queryFn: printersApi.list })

  // ── Printer assignment state ───────────────────────────────────────────────
  const [assignment,        setAssignment]        = useState<SlotAssignment>(null)
  const [initialAssignment, setInitialAssignment] = useState<SlotAssignment>(null)
  const [assignPrinterId,   setAssignPrinterId]   = useState<number | ''>('')

  // Pull unique supplier names from the cached spools list (no extra network call)
  const cachedSpoolsData = queryClient.getQueryData<{ items: { supplier: string | null }[] }>(['spools', 'all'])
  const knownSuppliers = useMemo(() =>
    [...new Set((cachedSpoolsData?.items ?? []).map((s) => s.supplier).filter((s): s is string => !!s))].sort()
  , [cachedSpoolsData])

  // ── Form ───────────────────────────────────────────────────────────────────
  const {
    register, handleSubmit, setValue, watch, control, reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // Pre-fill form when spool loads
  useEffect(() => {
    if (!spool) return
    reset({
      brand_id:       spool.brand?.id,
      filament_id:    spool.filament?.id,
      material:       spool.filament?.material ?? '',
      diameter:       spool.filament?.diameter ?? 1.75,
      color_name:     spool.filament?.color_name ?? '',
      color_hex:      spool.filament?.color_hex ?? '',
      initial_weight: spool.initial_weight,
      spool_weight:   spool.spool_weight ?? undefined,
      used_weight:    spool.used_weight,
      location_id:    spool.location?.id,
      supplier:       spool.supplier ?? '',
      product_url:    spool.product_url ?? '',
      purchase_date:      spool.purchase_date ? spool.purchase_date.split('T')[0] : '',
      purchase_price:     spool.purchase_price ?? undefined,
      name:               spool.name ?? '',
      lot_nr:             spool.lot_nr ?? '',
      notes:              spool.notes ?? '',
      extra_color_hex_2:  spool.extra_color_hex_2 ?? '',
      extra_color_hex_3:  spool.extra_color_hex_3 ?? '',
      extra_color_hex_4:  spool.extra_color_hex_4 ?? '',
    })
    if (spool.extra_color_hex_2) setColorHex2(spool.extra_color_hex_2)
    if (spool.extra_color_hex_3) setColorHex3(spool.extra_color_hex_3)
    if (spool.extra_color_hex_4) setColorHex4(spool.extra_color_hex_4)
    if (spool.color_hex)            setColorHex(spool.color_hex)
    else if (spool.filament?.color_hex) setColorHex(spool.filament.color_hex)
    if (spool.filament?.name)      setFilamentName(spool.filament.name)
    if (spool.brand)               setSelectedBrand(spool.brand)
    if (spool.location)            setSelectedLocation(spool.location)
    if (spool.filament)            setSelectedFilament(spool.filament)
    setPhotoUrl(spool.photo_url ?? '')
    setStatus(spool.status)
  }, [spool, reset])

  // Detect current printer assignment for this spool
  useEffect(() => {
    if (!spool || !printers.length) return
    const spoolId = spool.id
    let found: SlotAssignment = null
    outer: for (const printer of printers) {
      if (printer.direct_spool_id === spoolId) {
        found = { type: 'direct', printerId: printer.id }
        break
      }
      for (const unit of printer.ams_units) {
        for (const slot of unit.slots) {
          if (slot.spool_id === spoolId) {
            found = { type: 'ams', printerId: printer.id, unitId: unit.id, slotIndex: slot.slot_index }
            break outer
          }
        }
      }
    }
    setAssignment(found)
    setInitialAssignment(found)
    if (found) setAssignPrinterId(found.printerId)
  }, [spool, printers])

  const watchedInitial    = watch('initial_weight') || 0
  const watchedUsed       = watch('used_weight')    || 0
  const watchedMaterial   = watch('material')       || ''
  const watchedDiameter   = watch('diameter')       || 1.75
  const watchedUrl        = watch('product_url')    || ''
  const watchedBrandId    = watch('brand_id')
  const watchedFilamentId = watch('filament_id')

  // Active filament for print settings display
  const displayFilament = selectedFilament ?? spool?.filament ?? null

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addBrandMutation = useMutation({
    mutationFn: (name: string) => brandsApi.create({ name }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
  })

  const addLocationMutation = useMutation({
    mutationFn: (name: string) => locationsApi.create({ name }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['locations'] }),
  })

  const moveOccupierMutation = useMutation({
    mutationFn: ({ spoolId, locationId }: { spoolId: number; locationId: number | undefined }) =>
      spoolsApi.update(spoolId, { location_id: locationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })

  function handleLocationChange(locId: number | undefined, item: LocationResponse | undefined) {
    if (!item || !item.slot_type) {
      setValue('location_id', locId)
      setSelectedLocation(item)
      return
    }
    if (spool && item.id === spool.location?.id) {
      setValue('location_id', locId)
      setSelectedLocation(item)
      return
    }
    if (item.spool_count > 0) {
      setConflictSlot({ targetLocation: item, occupyingSpool: null, loading: true })
      spoolsApi.list({ location_id: item.id, page_size: 5 })
        .then((result) => {
          const occupier = result.items.find((s) => s.id !== Number(id))
          setConflictSlot((prev) => prev ? { ...prev, occupyingSpool: occupier ?? null, loading: false } : null)
        })
        .catch(() => setConflictSlot((prev) => prev ? { ...prev, loading: false } : null))
      return
    }
    setValue('location_id', locId)
    setSelectedLocation(item)
  }

  function handleConflictKeep() {
    setConflictSlot(null)
  }

  function handleConflictMove(destLocationId: number | undefined) {
    const conflict = conflictSlot
    if (!conflict) return
    if (!conflict.occupyingSpool) {
      setValue('location_id', conflict.targetLocation.id)
      setSelectedLocation(conflict.targetLocation)
      setConflictSlot(null)
      return
    }
    moveOccupierMutation.mutate(
      { spoolId: conflict.occupyingSpool.id, locationId: destLocationId },
      {
        onSuccess: () => {
          setValue('location_id', conflict.targetLocation.id)
          setSelectedLocation(conflict.targetLocation)
          setConflictSlot(null)
        },
      },
    )
  }

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const weightG = weightUnit === 'kg'
        ? (data.initial_weight ?? 0) * 1000
        : (data.initial_weight ?? 0)

      // When active with a printer slot assigned, sync location_id to the slot's location
      let locationId: number | undefined = data.location_id || undefined
      if (status === 'active' && assignment !== null) {
        if (assignment.type === 'direct') {
          locationId = locations.find((l) => l.printer_id === assignment.printerId && l.slot_type === 'ext')?.id
        } else {
          const printer = printers.find((p) => p.id === assignment.printerId)
          const unit = printer?.ams_units.find((u) => u.id === assignment.unitId)
          if (unit) {
            locationId = locations.find((l) =>
              l.printer_id === assignment.printerId &&
              l.slot_type === 'ams' &&
              l.ams_unit_index === unit.unit_index &&
              l.ams_slot_index === assignment.slotIndex,
            )?.id
          } else {
            locationId = undefined
          }
        }
      }

      const updated = await spoolsApi.update(Number(id), {
        filament_id:    data.filament_id  || undefined,
        brand_id:       data.brand_id     || undefined,
        location_id:    locationId,
        name:           data.name         || undefined,
        lot_nr:         data.lot_nr       || undefined,
        photo_url:      !photo ? (photoUrl || null) : undefined,
        initial_weight: weightG,
        spool_weight:   data.spool_weight || undefined,
        used_weight:    data.used_weight  ?? 0,
        purchase_date:      data.purchase_date  || undefined,
        purchase_price:     data.purchase_price || undefined,
        supplier:           data.supplier    || undefined,
        product_url:        data.product_url || undefined,
        color_hex:          colorHex || undefined,
        extra_color_hex_2:  colorHex2 || undefined,
        extra_color_hex_3:  colorHex3 || undefined,
        extra_color_hex_4:  colorHex4 || undefined,
        status,
        notes:              data.notes || undefined,
      })

      if (photo) await spoolsApi.uploadPhoto(updated.id, photo)

      return updated
    },
    onSuccess: async (saved) => {
      // Apply printer assignment changes
      const prev = initialAssignment
      const next = assignment

      const sameAssignment =
        prev === next ||
        (prev && next &&
          prev.type === next.type &&
          prev.printerId === next.printerId &&
          (prev.type === 'direct' || (prev.type === 'ams' && next.type === 'ams' &&
            prev.unitId === next.unitId && prev.slotIndex === next.slotIndex)))

      if (!sameAssignment) {
        // Clear old assignment
        if (prev) {
          if (prev.type === 'direct') {
            await printersApi.assignDirectSpool(prev.printerId, null)
          } else {
            await printersApi.assignAmsSlot(prev.printerId, prev.unitId, prev.slotIndex, null)
          }
        }
        // Set new assignment
        if (next) {
          if (next.type === 'direct') {
            await printersApi.assignDirectSpool(next.printerId, saved.id)
          } else {
            await printersApi.assignAmsSlot(next.printerId, next.unitId, next.slotIndex, saved.id)
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['spools'] })
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      navigate(-1)
    },
    onError: (err) => setSubmitError(getErrorMessage(err)),
  })

  // ── Auto-fill from selected filament ──────────────────────────────────────
  const handleFilamentSelect = useCallback((fp: FilamentProfileResponse) => {
    setValue('filament_id', fp.id)
    setValue('material',    fp.material)
    setValue('diameter',    fp.diameter)
    if (fp.color_name) setValue('color_name', fp.color_name)
    if (fp.color_hex)  { setColorHex(fp.color_hex); setValue('color_hex', fp.color_hex) }
    setSelectedFilament(fp)
  }, [setValue])

  const spoolDisplayName = spool
    ? (spool.name ?? spool.filament?.name ?? `Spool #${spool.id}`)
    : '…'

  if (loadingSpool) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-border border-t-primary-500" />
      </div>
    )
  }

  if (!spool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-gray-400">Spool not found.</p>
        <Button variant="secondary" onClick={() => navigate(-1)}>Back to inventory</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-surface-border bg-surface/80 backdrop-blur px-5 lg:px-7 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-white">Edit Spool</h1>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Link to="/spools" className="hover:text-gray-300 transition-colors">Inventory</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-gray-400 truncate max-w-[180px]">{spoolDisplayName}</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-gray-400">Edit</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <div className="px-5 lg:px-7 pt-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 max-w-5xl mx-auto">

        {/* ── Left: form ────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Section 1: Filament Info */}
          <Section label="Filament Info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SmartDropdown
                label="Brand"
                items={brands}
                value={watchedBrandId}
                onChange={(id, item) => { setValue('brand_id', id); setSelectedBrand(item); setValue('filament_id', undefined); setFilamentName('') }}
                renderItem={(b) => (
                  <span className="flex items-center gap-2 w-full">
                    {b.logo_url && <img src={b.logo_url} alt="" className="h-4 w-4 object-contain rounded" />}
                    {b.name}
                  </span>
                )}
                onAddNew={(name) => addBrandMutation.mutateAsync(name)}
                addLabel="Add brand"
              />
              <FilamentAutocomplete
                brandId={watchedBrandId}
                value={filamentName}
                onChange={(v) => { setFilamentName(v); if (!v) { setValue('filament_id', undefined); setSelectedFilament(undefined) } }}
                onSelect={(fp) => { handleFilamentSelect(fp); setSelectedBrand(brands.find((b) => b.id === fp.brand?.id)) }}
              />
            </div>

            {watchedFilamentId && (
              <div className="flex items-center gap-2 rounded-lg bg-primary-900/20 border border-primary-700/30 px-3 py-1.5 text-xs text-primary-300">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Filament profile linked
                <button type="button" className="ml-auto text-gray-500 hover:text-gray-300"
                  onClick={() => { setValue('filament_id', undefined); setFilamentName(''); setSelectedFilament(undefined) }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">
                  Material <span className="text-red-400">*</span>
                </label>
                <select {...register('material')}
                  className={`w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none ${errors.material ? 'border-red-500' : 'border-surface-border'}`}>
                  <option value="">— Select material —</option>
                  {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <FieldError msg={errors.material?.message} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">
                  Diameter <span className="text-red-400">*</span>
                </label>
                <Controller name="diameter" control={control} render={({ field }) => (
                  <div className="flex rounded-lg border border-surface-border overflow-hidden">
                    {[1.75, 2.85].map((d) => (
                      <button key={d} type="button" onClick={() => field.onChange(d)}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${field.value === d ? 'bg-primary-600 text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white'}`}>
                        {d}mm
                      </button>
                    ))}
                  </div>
                )} />
              </div>
            </div>

            <Input label="Color name" placeholder='e.g. "Bambu Blue"' {...register('color_name')} />

            {/* Multi-color picker */}
            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-medium text-gray-300">Colors <span className="text-gray-500 font-normal">(up to 4)</span></label>

              {/* Swatch row */}
              <div className="flex items-center gap-2">
                {/* Slot 1 — primary, always visible */}
                {([
                  { slot: 1 as const, hex: colorHex },
                  ...(colorHex ? [{ slot: 2 as const, hex: colorHex2 }] : []),
                  ...(colorHex2 ? [{ slot: 3 as const, hex: colorHex3 }] : []),
                  ...(colorHex3 ? [{ slot: 4 as const, hex: colorHex4 }] : []),
                ]).map(({ slot, hex }) => (
                  <div key={slot} className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveColorSlot(slot)}
                      className={`h-9 w-9 rounded-full border-2 transition-all ${activeColorSlot === slot ? 'border-white shadow-[0_0_0_2px_#6366f1]' : 'border-transparent hover:border-white/40'}`}
                      style={{ backgroundColor: hex || '#374151' }}
                      title={`Color ${slot}`}
                    />
                    {slot > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (slot === 2) { setColorHex2(''); setValue('extra_color_hex_2', ''); setColorHex3(''); setValue('extra_color_hex_3', ''); setColorHex4(''); setValue('extra_color_hex_4', '') }
                          if (slot === 3) { setColorHex3(''); setValue('extra_color_hex_3', ''); setColorHex4(''); setValue('extra_color_hex_4', '') }
                          if (slot === 4) { setColorHex4(''); setValue('extra_color_hex_4', '') }
                          setActiveColorSlot((slot - 1) as 1|2|3|4)
                        }}
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gray-700 border border-surface-border text-gray-300 hover:bg-red-800 hover:text-red-200 flex items-center justify-center transition-colors"
                        title="Remove color"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Add button — shown if the last slot has a color and we're < 4 */}
                {colorHex && !(colorHex2 && colorHex3 && colorHex4) && (
                  <button
                    type="button"
                    onClick={() => {
                      const defaultHex = '#6366F1'
                      if (!colorHex2) {
                        setColorHex2(defaultHex); setValue('extra_color_hex_2', defaultHex); setActiveColorSlot(2)
                      } else if (!colorHex3) {
                        setColorHex3(defaultHex); setValue('extra_color_hex_3', defaultHex); setActiveColorSlot(3)
                      } else if (!colorHex4) {
                        setColorHex4(defaultHex); setValue('extra_color_hex_4', defaultHex); setActiveColorSlot(4)
                      }
                    }}
                    className="h-9 w-9 rounded-full border-2 border-dashed border-surface-border text-gray-500 hover:border-primary-500 hover:text-primary-400 flex items-center justify-center transition-colors"
                    title="Add another color"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Active slot picker */}
              <div className="rounded-xl border border-surface-border bg-surface-2 p-3">
                <p className="text-xs text-gray-500 mb-2">
                  Color {activeColorSlot}
                </p>
                <ColorPicker
                  value={activeColorSlot === 1 ? colorHex : activeColorSlot === 2 ? colorHex2 : activeColorSlot === 3 ? colorHex3 : colorHex4}
                  onChange={(hex) => {
                    if (activeColorSlot === 1) { setColorHex(hex); setValue('color_hex', hex) }
                    if (activeColorSlot === 2) { setColorHex2(hex); setValue('extra_color_hex_2', hex) }
                    if (activeColorSlot === 3) { setColorHex3(hex); setValue('extra_color_hex_3', hex) }
                    if (activeColorSlot === 4) { setColorHex4(hex); setValue('extra_color_hex_4', hex) }
                  }}
                />
              </div>
              <FieldError msg={errors.color_hex?.message} />
            </div>

            <Input label="Custom spool name" placeholder="Optional — overrides filament name in the UI" {...register('name')} />
          </Section>

          {/* Section 2: Photo */}
          <Section label="Photo">
            <PhotoDropzone
              file={photo}
              onChange={(f) => { setPhoto(f); setPhotoUrl('') }}
              existingUrl={photoUrl}
            />
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-gray-500">Or enter a photo URL</p>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                <input
                  type="url"
                  value={photoUrl}
                  onChange={(e) => { setPhotoUrl(e.target.value); if (e.target.value) setPhoto(null) }}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full rounded-lg border border-surface-border bg-surface-2 pl-8 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                />
              </div>
              {photoUrl && (() => {
                try { new URL(photoUrl); return (
                  <img src={photoUrl} alt="Preview" className="mt-2 h-28 w-full rounded-lg object-cover border border-surface-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )} catch { return null }
              })()}
            </div>
          </Section>

          {/* Section 3: Weight & Stock */}
          <Section label="Weight & Stock">
            {/* Status */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Status</label>
              <div className="flex rounded-lg border border-surface-border overflow-hidden">
                {STATUSES.map((s) => (
                  <button key={s.value} type="button" onClick={() => setStatus(s.value)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${status === s.value ? `${s.color} text-white` : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Printer assignment — only when Active */}
            {status === 'active' && (
              <PrinterAssignmentPicker
                printers={printers}
                selectedPrinterId={assignPrinterId}
                assignment={assignment}
                onPrinterChange={(pid) => {
                  setAssignPrinterId(pid)
                  setAssignment(null)
                }}
                onSlotSelect={setAssignment}
              />
            )}

            {/* Initial weight */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">
                Initial weight <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input type="number" step={weightUnit === 'kg' ? '0.001' : '1'}
                    placeholder={weightUnit === 'kg' ? '1.000' : '1000'}
                    {...register('initial_weight')}
                    className={`w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none ${errors.initial_weight ? 'border-red-500' : 'border-surface-border'}`}
                  />
                </div>
                <div className="flex rounded-lg border border-surface-border overflow-hidden">
                  {(['g', 'kg'] as const).map((u) => (
                    <button key={u} type="button" onClick={() => setWeightUnit(u)}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${weightUnit === u ? 'bg-primary-600 text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white'}`}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <FieldError msg={errors.initial_weight?.message} />
              <div className="flex gap-1.5 flex-wrap mt-1">
                {WEIGHT_PRESETS.map((w) => (
                  <button key={w} type="button"
                    onClick={() => setValue('initial_weight', weightUnit === 'kg' ? w / 1000 : w)}
                    className="rounded-full border border-surface-border bg-surface-2 px-2.5 py-0.5 text-xs text-gray-400 hover:bg-surface-3 hover:text-white transition-colors">
                    {w}g
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Empty spool weight (g)" type="number" step="1" placeholder="~250" {...register('spool_weight')} />
              <Input label="Used weight (g)" type="number" step="1" placeholder="0" {...register('used_weight')} />
            </div>

            {watchedInitial > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0 g</span><span>{watchedInitial} g</span>
                </div>
                <input type="range" min={0} max={watchedInitial} step={1} value={watchedUsed}
                  onChange={(e) => setValue('used_weight', Number(e.target.value))}
                  className="w-full accent-primary-500"
                />
              </div>
            )}
          </Section>

          {/* Section 4: Print Settings (informational, from filament profile) */}
          <Section label="Print Settings">
            {displayFilament ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 -mt-1">
                  From the linked filament profile. To change these values, edit the filament profile on the{' '}
                  <Link to="/filaments" className="text-primary-400 hover:text-primary-300">Filament Profiles</Link>.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {displayFilament.print_temp_min && displayFilament.print_temp_max && (
                    <PrintInfoChip label="Print temp" value={`${displayFilament.print_temp_min}–${displayFilament.print_temp_max}°C`} />
                  )}
                  {displayFilament.bed_temp_min && displayFilament.bed_temp_max && (
                    <PrintInfoChip label="Bed temp" value={`${displayFilament.bed_temp_min}–${displayFilament.bed_temp_max}°C`} />
                  )}
                  {displayFilament.max_print_speed && (
                    <PrintInfoChip label="Max speed" value={`${displayFilament.max_print_speed} mm/s`} />
                  )}
                  {displayFilament.drying_temp && (
                    <PrintInfoChip label="Drying" value={`${displayFilament.drying_temp}°C · ${displayFilament.drying_duration ?? '?'}h`} />
                  )}
                  {!displayFilament.print_temp_min && !displayFilament.bed_temp_min && !displayFilament.max_print_speed && !displayFilament.drying_temp && (
                    <p className="col-span-full text-sm text-gray-500">No print settings on this filament profile.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 -mt-1">Select a filament profile above to see its print settings.</p>
            )}
          </Section>

          {/* Section 5: Storage — hidden when Active with a printer slot assigned */}
          {!(status === 'active' && assignment !== null) && <Section label="Storage">
            <SmartDropdown
              label="Storage location"
              items={locations}
              value={watch('location_id')}
              onChange={handleLocationChange}
              placeholder="Select or add a storage location…"
              onAddNew={(name) => addLocationMutation.mutateAsync(name)}
              addLabel="Add location"
              renderItem={(loc) => (
                <span className="flex items-center gap-2">
                  {loc.is_dry_box && (
                    <span className="rounded-full bg-accent-900/40 border border-accent-700/40 px-1.5 py-0 text-xs text-accent-300">Dry box</span>
                  )}
                  {loc.name}
                  {loc.description && <span className="text-xs text-gray-500">· {loc.description}</span>}
                </span>
              )}
            />
            {selectedLocation && (
              <SelectedTag
                label={selectedLocation.is_dry_box ? `📦 ${selectedLocation.name}` : selectedLocation.name}
                onRemove={() => { setValue('location_id', undefined); setSelectedLocation(undefined) }}
              />
            )}
          </Section>}

          {/* Section 6: Purchase & Supplier */}
          <Section label="Purchase & Supplier">
            {/* Supplier + Product URL — paired row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <StringSmartDropdown
                label="Supplier"
                items={knownSuppliers}
                value={watch('supplier') || undefined}
                onChange={(v) => setValue('supplier', v ?? '')}
                placeholder="Select or add supplier…"
                addLabel="Add supplier"
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Product URL</label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="url"
                    placeholder="https://…"
                    {...register('product_url')}
                    className={`w-full rounded-lg border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none ${errors.product_url ? 'border-red-500' : 'border-surface-border'}`}
                  />
                </div>
                {errors.product_url && <p className="text-xs text-red-400">{errors.product_url.message}</p>}
                <URLPreview url={watchedUrl} />
              </div>
            </div>

            {/* Date + Cost */}
            <div className="grid grid-cols-2 gap-4">
              <Input label="Purchase date" type="date" {...register('purchase_date')} />
              <Input label="Cost paid" type="number" step="0.01" placeholder="0.00" {...register('purchase_price')} />
            </div>

            {/* Lot */}
            <Input label="Lot / batch number" placeholder="Optional" {...register('lot_nr')} />
          </Section>

          {/* Section 7: Notes */}
          <Section label="Notes">
            <textarea {...register('notes')} rows={4}
              placeholder="Any notes about this spool…"
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none resize-none"
            />
          </Section>

          {submitError && (
            <div className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
              {submitError}
            </div>
          )}
        </div>

        {/* ── Right: live preview ────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-[73px] h-fit">
          <SpoolPreview
            brandName={selectedBrand?.name ?? ''}
            filamentName={filamentName}
            material={watchedMaterial}
            colorHex={colorHex}
            colorHex2={colorHex2 || undefined}
            colorHex3={colorHex3 || undefined}
            colorHex4={colorHex4 || undefined}
            diameter={watchedDiameter}
            initialWeight={watchedInitial}
            usedWeight={watchedUsed}
            printTempMin={displayFilament?.print_temp_min ?? undefined}
            printTempMax={displayFilament?.print_temp_max ?? undefined}
          />
        </div>
      </div>

      {/* ── Slot conflict dialog ────────────────────────────────────────────── */}
      {conflictSlot && (
        <SlotConflictDialog
          targetLocation={conflictSlot.targetLocation}
          occupyingSpool={conflictSlot.occupyingSpool}
          loadingOccupier={conflictSlot.loading}
          locations={locations}
          movePending={moveOccupierMutation.isPending}
          onKeep={handleConflictKeep}
          onMove={handleConflictMove}
        />
      )}

      {/* ── Sticky footer ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-surface-border bg-surface/90 backdrop-blur px-5 lg:px-7 py-3">
        <div className="flex items-center justify-end gap-3 max-w-5xl mx-auto">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          <Button
            type="button"
            loading={submitMutation.isPending}
            onClick={handleSubmit(
              (data) => { setSubmitError(''); submitMutation.mutate(data) },
              () => setSubmitError('Please fix the errors above before saving.'),
            )}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
