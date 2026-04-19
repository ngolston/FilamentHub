import { useState, useRef, useEffect, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, ChevronDown, ChevronRight, Upload, X, Plus, Check, Link2,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { filamentsApi } from '@/api/filaments'
import { brandsApi } from '@/api/brands'
import { locationsApi } from '@/api/locations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import type { FilamentProfileResponse, BrandResponse, LocationResponse } from '@/types/api'

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

// ── Zod schema ────────────────────────────────────────────────────────────────

const schema = z.object({
  brand_id:       z.coerce.number().optional(),
  filament_id:    z.coerce.number().optional(),
  filament_name:  z.string().optional(),
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
  print_temp_min: z.coerce.number().min(0).optional(),
  print_temp_max: z.coerce.number().min(0).optional(),
  bed_temp_min:   z.coerce.number().min(0).optional(),
  bed_temp_max:   z.coerce.number().min(0).optional(),
  max_print_speed:z.coerce.number().min(0).optional(),
  drying_temp:    z.coerce.number().min(0).optional(),
  drying_duration:z.coerce.number().min(0).optional(),
  location_id:    z.coerce.number().optional(),
  supplier:       z.string().optional(),
  product_url:    z.string().url('Must be a valid URL').optional().or(z.literal('')),
  purchase_date:  z.string().optional(),
  purchase_price: z.coerce.number().min(0).optional(),
  name:           z.string().optional(),
  notes:          z.string().optional(),
})
.refine(
  (d) => !d.print_temp_min || !d.print_temp_max || d.print_temp_min <= d.print_temp_max,
  { message: 'Min must be ≤ max', path: ['print_temp_min'] },
)
.refine(
  (d) => !d.bed_temp_min || !d.bed_temp_max || d.bed_temp_min <= d.bed_temp_max,
  { message: 'Min must be ≤ max', path: ['bed_temp_min'] },
)

type FormData = z.infer<typeof schema>

// ── SmartDropdown ─────────────────────────────────────────────────────────────

interface SmartDropdownProps<T extends { id: number; name: string }> {
  label: string
  items: T[]
  value: number | undefined
  onChange: (id: number | undefined, item: T | undefined) => void
  placeholder?: string
  onAddNew?: (name: string) => Promise<T>
  addLabel?: string
  renderItem?: (item: T) => React.ReactNode
}

function SmartDropdown<T extends { id: number; name: string }>({
  label, items, value, onChange, placeholder, onAddNew, addLabel, renderItem,
}: SmartDropdownProps<T>) {
  const [open, setOpen]         = useState(false)
  const [search, setSearch]     = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName]   = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = items.find((i) => i.id === value)
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  )

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAddingNew(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleAdd() {
    if (!onAddNew || !newName.trim()) return
    setCreating(true)
    try {
      const item = await onAddNew(newName.trim())
      onChange(item.id, item)
      setNewName('')
      setAddingNew(false)
      setOpen(false)
      setSearch('')
    } finally {
      setCreating(false)
    }
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
          {/* Search */}
          <div className="p-2 border-b border-surface-border">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>

          {/* None */}
          <button
            type="button"
            onClick={() => { onChange(undefined, undefined); setOpen(false) }}
            className={`w-full px-3 py-2 text-left text-sm transition-colors ${
              !value ? 'text-primary-300 bg-primary-900/20' : 'text-gray-400 hover:bg-surface-2'
            }`}
          >
            <span className="italic">— None —</span>
          </button>

          {/* Items */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onChange(item.id, item); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  value === item.id
                    ? 'bg-primary-600/20 text-white'
                    : 'text-gray-300 hover:bg-surface-2 hover:text-white'
                }`}
              >
                {renderItem ? renderItem(item) : item.name}
                {value === item.id && <Check className="ml-auto h-3.5 w-3.5 text-primary-400 shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && !addingNew && (
              <p className="px-3 py-3 text-sm text-gray-500 text-center">No matches</p>
            )}
          </div>

          {/* Add new */}
          {onAddNew && (
            <div className="border-t border-surface-border">
              {!addingNew ? (
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-400 hover:bg-surface-2 hover:text-primary-300 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {addLabel ?? `Add new ${label.toLowerCase()}`}
                </button>
              ) : (
                <div className="p-2 flex gap-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder={`${label} name…`}
                    className="flex-1 rounded-lg border border-surface-border bg-surface-2 px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500"
                  />
                  <button
                    type="button"
                    disabled={!newName.trim() || creating}
                    onClick={handleAdd}
                    className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-500 disabled:opacity-50"
                  >
                    {creating ? '…' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingNew(false); setNewName('') }}
                    className="rounded-lg px-2 py-1.5 text-gray-400 hover:text-white hover:bg-surface-2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ColorPicker ───────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [customHex, setCustomHex] = useState(
    COLOR_PRESETS.some((c) => c.hex.toLowerCase() === value?.toLowerCase()) ? '' : (value ?? ''),
  )

  function handlePreset(hex: string) {
    setCustomHex('')
    onChange(hex)
  }

  function handleCustom(raw: string) {
    const val = raw.startsWith('#') ? raw : `#${raw}`
    setCustomHex(raw)
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) onChange(val)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            onClick={() => handlePreset(c.hex)}
            className="h-7 w-7 rounded-full border-2 transition-all"
            style={{
              backgroundColor: c.hex,
              borderColor: value?.toLowerCase() === c.hex.toLowerCase() ? '#fff' : 'transparent',
              boxShadow: value?.toLowerCase() === c.hex.toLowerCase() ? '0 0 0 1px #6366f1' : 'none',
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 shrink-0 rounded-lg border border-white/10"
          style={{ backgroundColor: value || '#6B7280' }}
        />
        <input
          type="text"
          value={customHex}
          onChange={(e) => handleCustom(e.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          className="w-28 rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none font-mono"
        />
        <span className="text-xs text-gray-500">or enter custom hex</span>
      </div>
    </div>
  )
}

// ── PhotoDropzone ─────────────────────────────────────────────────────────────

function PhotoDropzone({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleFile(f: File) {
    if (f.type.startsWith('image/')) onChange(f)
  }

  if (preview) {
    return (
      <div className="relative w-full h-40 rounded-xl overflow-hidden border border-surface-border">
        <img src={preview} alt="Spool preview" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 h-36 w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors
        ${dragging ? 'border-primary-500 bg-primary-900/10' : 'border-surface-border hover:border-gray-600 bg-surface-2'}`}
    >
      <Upload className="h-7 w-7 text-gray-500" />
      <p className="text-sm text-gray-400">
        Drop a photo or <span className="text-primary-400">click to browse</span>
      </p>
      <p className="text-xs text-gray-600">JPEG · PNG · WebP</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}

// ── SpoolPreview ──────────────────────────────────────────────────────────────

interface PreviewProps {
  brandName:    string
  filamentName: string
  material:     string
  colorHex:     string
  diameter:     number
  initialWeight: number
  usedWeight:   number
  printTempMin: number | undefined
  printTempMax: number | undefined
}

function SpoolPreview({
  brandName, filamentName, material, colorHex, diameter,
  initialWeight, usedWeight, printTempMin, printTempMax,
}: PreviewProps) {
  const remaining = Math.max(0, (initialWeight || 0) - (usedWeight || 0))
  const pct       = initialWeight > 0 ? Math.min(100, (remaining / initialWeight) * 100) : 100
  const color     = /^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : '#6366F1'

  const r            = 56
  const cx = 80, cy = 80
  const sw           = 16
  const circumference = 2 * Math.PI * r
  const dashOffset    = circumference * (1 - pct / 100)

  const statusColor = pct > 25 ? '#22c55e' : pct > 10 ? '#eab308' : '#ef4444'
  const statusLabel = pct > 25 ? 'OK' : pct > 10 ? 'Low' : 'Critical'

  const displayName = [brandName, filamentName].filter(Boolean).join(' ') || 'Unnamed spool'

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 p-5 flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Live Preview</p>

      {/* Ring graphic */}
      <div className="flex justify-center">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {/* Outer dashed wound-filament arc */}
          <circle cx={cx} cy={cy} r={r + sw / 2 + 6} fill="none" stroke="#374151" strokeWidth={1.5} strokeDasharray="3 5" />
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={sw} />
          {/* Fill arc */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={String(circumference)}
            strokeDashoffset={String(dashOffset)}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.2s ease' }}
          />
          {/* Hub plate */}
          <circle cx={cx} cy={cy} r={22} fill="#111827" />
          {/* Hub bolt */}
          <circle cx={cx} cy={cy} r={7} fill="#374151" />
          <circle cx={cx} cy={cy} r={3} fill="#1f2937" />
          {/* Percentage text */}
          <text
            x={cx} y={cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize="13"
            fontWeight="700"
            fontFamily="system-ui"
          >
            {pct.toFixed(0)}%
          </text>
        </svg>
      </div>

      {/* Name + material */}
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-white leading-tight">{displayName}</p>
        <span className="inline-block rounded-full bg-surface-3 px-2.5 py-0.5 text-xs text-gray-300">
          {material || '—'}
        </span>
      </div>

      {/* Fill bar */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-500">{remaining.toFixed(0)} g remaining</span>
          <span style={{ color: statusColor }}>{statusLabel}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>

      {/* Spec chips */}
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full border border-surface-border px-2.5 py-0.5 text-xs text-gray-300">
          {diameter}mm
        </span>
        {(printTempMin || printTempMax) && (
          <span className="rounded-full border border-surface-border px-2.5 py-0.5 text-xs text-gray-300">
            {printTempMin ?? '?'}–{printTempMax ?? '?'}°C
          </span>
        )}
        <span className="rounded-full border border-surface-border px-2.5 py-0.5 text-xs text-gray-300">
          {remaining.toFixed(0)} g
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
        <span className="text-xs text-gray-400">{statusLabel} · {pct.toFixed(0)}% remaining</span>
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      {children}
    </div>
  )
}

// ── FieldError ────────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-red-400 mt-0.5">{msg}</p>
}

// ── FilamentAutocomplete ──────────────────────────────────────────────────────

function FilamentAutocomplete({
  brandId,
  value,
  onChange,
  onSelect,
}: {
  brandId: number | undefined
  value: string
  onChange: (v: string) => void
  onSelect: (fp: FilamentProfileResponse) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef    = useRef<HTMLDivElement>(null)

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
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={brandId ? 'Search or type a filament name…' : 'Type a filament name…'}
        className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 max-h-48 overflow-y-auto rounded-xl border border-surface-border bg-surface-1 shadow-2xl">
          {suggestions.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { onSelect(f); onChange(f.name); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors"
            >
              <div
                className="h-4 w-4 shrink-0 rounded-full border border-white/10"
                style={{ backgroundColor: f.color_hex ?? '#374151' }}
              />
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
  } catch {
    return null
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AddSpoolPage() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  // ── Local state ────────────────────────────────────────────────────────────
  const [photo, setPhoto]           = useState<File | null>(null)
  const [colorHex, setColorHex]     = useState('#6366F1')
  const [weightUnit, setWeightUnit] = useState<'g' | 'kg'>('g')
  const [submitError, setSubmitError] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<BrandResponse | undefined>()
  const [selectedLocation, setSelectedLocation] = useState<LocationResponse | undefined>()
  const [filamentName, setFilamentName] = useState('')

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: brands    = [] } = useQuery({ queryKey: ['brands'],    queryFn: () => brandsApi.list() })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list })

  // ── Form ───────────────────────────────────────────────────────────────────
  const {
    register, handleSubmit, setValue, watch, control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      diameter:      1.75,
      used_weight:   0,
      purchase_date: new Date().toISOString().split('T')[0],
    },
  })

  const watchedInitial  = watch('initial_weight') || 0
  const watchedUsed     = watch('used_weight') || 0
  const watchedMaterial = watch('material') || ''
  const watchedDiameter = watch('diameter') || 1.75
  const watchedTempMin  = watch('print_temp_min')
  const watchedTempMax  = watch('print_temp_max')
  const watchedUrl      = watch('product_url') || ''
  const watchedBrandId  = watch('brand_id')
  const watchedFilamentId = watch('filament_id')

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addBrandMutation = useMutation({
    mutationFn: (name: string) => brandsApi.create({ name }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
  })

  const addLocationMutation = useMutation({
    mutationFn: (name: string) => locationsApi.create({ name }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['locations'] }),
  })

  const submitMutation = useMutation({
    mutationFn: async ({ data, status }: { data: FormData; status: 'active' | 'archived' }) => {
      let filamentId = data.filament_id

      // Create a new filament profile if none selected but details were entered
      if (!filamentId && (filamentName || data.material)) {
        const fp = await filamentsApi.create({
          brand_id:        data.brand_id || undefined,
          name:            filamentName || `Custom ${data.material}`,
          material:        data.material,
          diameter:        data.diameter,
          color_name:      data.color_name || undefined,
          color_hex:       colorHex || undefined,
          print_temp_min:  data.print_temp_min || undefined,
          print_temp_max:  data.print_temp_max || undefined,
          bed_temp_min:    data.bed_temp_min   || undefined,
          bed_temp_max:    data.bed_temp_max   || undefined,
          max_print_speed: data.max_print_speed || undefined,
          drying_temp:     data.drying_temp    || undefined,
          drying_duration: data.drying_duration || undefined,
        })
        filamentId = fp.id
        queryClient.invalidateQueries({ queryKey: ['filaments'] })
      }

      const weightG = weightUnit === 'kg'
        ? (data.initial_weight ?? 0) * 1000
        : (data.initial_weight ?? 0)

      const spool = await spoolsApi.create({
        filament_id:    filamentId    || undefined,
        brand_id:       data.brand_id || undefined,
        location_id:    data.location_id || undefined,
        name:           data.name    || undefined,
        initial_weight: weightG,
        spool_weight:   data.spool_weight || undefined,
        used_weight:    data.used_weight || 0,
        purchase_date:  data.purchase_date  || undefined,
        purchase_price: data.purchase_price || undefined,
        supplier:       data.supplier   || undefined,
        product_url:    data.product_url || undefined,
        status,
        notes:          data.notes || undefined,
      })

      if (photo) await spoolsApi.uploadPhoto(spool.id, photo)

      return spool
    },
    onSuccess: (spool, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      if (status === 'archived') {
        navigate('/spools')
      } else {
        navigate('/spools')
        // TODO: navigate to /spools/:id when spool detail page exists
      }
    },
    onError: (err) => setSubmitError(getErrorMessage(err)),
  })

  // ── Auto-fill from selected filament ──────────────────────────────────────
  const handleFilamentSelect = useCallback((fp: FilamentProfileResponse) => {
    setValue('filament_id', fp.id)
    setValue('material',      fp.material)
    setValue('diameter',      fp.diameter)
    if (fp.color_name)    setValue('color_name', fp.color_name)
    if (fp.color_hex)     { setColorHex(fp.color_hex); setValue('color_hex', fp.color_hex) }
    if (fp.print_temp_min !== null && fp.print_temp_min !== undefined) setValue('print_temp_min', fp.print_temp_min)
    if (fp.print_temp_max !== null && fp.print_temp_max !== undefined) setValue('print_temp_max', fp.print_temp_max)
    if (fp.bed_temp_min   !== null && fp.bed_temp_min   !== undefined) setValue('bed_temp_min',   fp.bed_temp_min)
    if (fp.bed_temp_max   !== null && fp.bed_temp_max   !== undefined) setValue('bed_temp_max',   fp.bed_temp_max)
    if (fp.max_print_speed !== null && fp.max_print_speed !== undefined) setValue('max_print_speed', fp.max_print_speed)
    if (fp.drying_temp    !== null && fp.drying_temp    !== undefined) setValue('drying_temp',    fp.drying_temp)
    if (fp.drying_duration !== null && fp.drying_duration !== undefined) setValue('drying_duration', fp.drying_duration)
  }, [setValue])

  const displayInitialWeight = weightUnit === 'kg'
    ? (watchedInitial / 1000).toFixed(3)
    : watchedInitial

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-surface-border bg-surface/80 backdrop-blur px-5 lg:px-7 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/spools')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-white">Add New Spool</h1>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Link to="/spools" className="hover:text-gray-300 transition-colors">Inventory</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-gray-400">Add Spool</span>
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
                onChange={(id, item) => {
                  setValue('brand_id', id)
                  setSelectedBrand(item)
                  setValue('filament_id', undefined)
                  setFilamentName('')
                }}
                renderItem={(b) => (
                  <span className="flex items-center gap-2 w-full">
                    {b.logo_url && (
                      <img src={b.logo_url} alt="" className="h-4 w-4 object-contain rounded" />
                    )}
                    {b.name}
                  </span>
                )}
                onAddNew={(name) => addBrandMutation.mutateAsync(name)}
                addLabel="Add brand"
              />

              <FilamentAutocomplete
                brandId={watchedBrandId}
                value={filamentName}
                onChange={(v) => { setFilamentName(v); if (!v) setValue('filament_id', undefined) }}
                onSelect={(fp) => { handleFilamentSelect(fp); setSelectedBrand(brands.find((b) => b.id === fp.brand?.id)) }}
              />
            </div>

            {watchedFilamentId && (
              <div className="flex items-center gap-2 rounded-lg bg-primary-900/20 border border-primary-700/30 px-3 py-1.5 text-xs text-primary-300">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Filament profile loaded — print settings auto-filled
                <button type="button" className="ml-auto text-gray-500 hover:text-gray-300" onClick={() => { setValue('filament_id', undefined); setFilamentName('') }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Material */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">
                  Material <span className="text-red-400">*</span>
                </label>
                <select
                  {...register('material')}
                  className={`w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none ${
                    errors.material ? 'border-red-500' : 'border-surface-border'
                  }`}
                >
                  <option value="">— Select material —</option>
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <FieldError msg={errors.material?.message} />
              </div>

              {/* Diameter */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">
                  Diameter <span className="text-red-400">*</span>
                </label>
                <Controller
                  name="diameter"
                  control={control}
                  render={({ field }) => (
                    <div className="flex rounded-lg border border-surface-border overflow-hidden">
                      {[1.75, 2.85].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => field.onChange(d)}
                          className={`flex-1 py-2 text-sm font-medium transition-colors ${
                            field.value === d
                              ? 'bg-primary-600 text-white'
                              : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white'
                          }`}
                        >
                          {d}mm
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>
            </div>

            {/* Color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Color name" placeholder='e.g. "Bambu Blue"' {...register('color_name')} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Color swatch</label>
              <ColorPicker
                value={colorHex}
                onChange={(hex) => { setColorHex(hex); setValue('color_hex', hex) }}
              />
              <FieldError msg={errors.color_hex?.message} />
            </div>

            <Input
              label="Custom spool name"
              placeholder="Optional — overrides filament name in the UI"
              {...register('name')}
            />
          </Section>

          {/* Section 2: Photo */}
          <Section label="Photo">
            <PhotoDropzone file={photo} onChange={setPhoto} />
          </Section>

          {/* Section 3: Weight & Stock */}
          <Section label="Weight & Stock">
            {/* Initial weight */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">
                Initial weight <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step={weightUnit === 'kg' ? '0.001' : '1'}
                    placeholder={weightUnit === 'kg' ? '1.000' : '1000'}
                    {...register('initial_weight')}
                    className={`w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none ${
                      errors.initial_weight ? 'border-red-500' : 'border-surface-border'
                    }`}
                  />
                </div>
                <div className="flex rounded-lg border border-surface-border overflow-hidden">
                  {(['g', 'kg'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setWeightUnit(u)}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        weightUnit === u
                          ? 'bg-primary-600 text-white'
                          : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <FieldError msg={errors.initial_weight?.message} />
              {/* Quick presets */}
              <div className="flex gap-1.5 flex-wrap mt-1">
                {WEIGHT_PRESETS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setValue('initial_weight', weightUnit === 'kg' ? w / 1000 : w)}
                    className="rounded-full border border-surface-border bg-surface-2 px-2.5 py-0.5 text-xs text-gray-400 hover:bg-surface-3 hover:text-white transition-colors"
                  >
                    {w}g
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Empty spool weight (g)"
                type="number"
                step="1"
                placeholder="~250"
                {...register('spool_weight')}
              />
              <div className="flex flex-col gap-1">
                <Input
                  label="Used weight (g)"
                  type="number"
                  step="1"
                  placeholder="0"
                  {...register('used_weight')}
                />
              </div>
            </div>

            {/* Used weight slider */}
            {watchedInitial > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0 g</span>
                  <span>{watchedInitial} g</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={watchedInitial}
                  step={1}
                  value={watchedUsed}
                  onChange={(e) => setValue('used_weight', Number(e.target.value))}
                  className="w-full accent-primary-500"
                />
              </div>
            )}
          </Section>

          {/* Section 4: Print Settings */}
          <Section label="Print Settings">
            <p className="text-xs text-gray-500 -mt-1">Auto-fills when a known filament profile is selected above.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Print temp range — full row on its own */}
              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Print temp range</label>
                <div className="flex gap-2">
                  <input
                    type="number" step="1" placeholder="Min °C"
                    {...register('print_temp_min')}
                    className="flex-1 rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                  />
                  <input
                    type="number" step="1" placeholder="Max °C"
                    {...register('print_temp_max')}
                    className="flex-1 rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <FieldError msg={errors.print_temp_min?.message} />
              </div>

              {/* Bed temp range — full row on its own */}
              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Bed temp range</label>
                <div className="flex gap-2">
                  <input
                    type="number" step="1" placeholder="Min °C"
                    {...register('bed_temp_min')}
                    className="flex-1 rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                  />
                  <input
                    type="number" step="1" placeholder="Max °C"
                    {...register('bed_temp_max')}
                    className="flex-1 rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <FieldError msg={errors.bed_temp_min?.message} />
              </div>

              {/* Smaller fields share a row */}
              <Input label="Max print speed (mm/s)" type="number" step="1" placeholder="Optional" {...register('max_print_speed')} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Drying temp (°C)" type="number" step="1" placeholder="Optional" {...register('drying_temp')} />
                <Input label="Duration (hrs)"   type="number" step="0.5" placeholder="Optional" {...register('drying_duration')} />
              </div>
            </div>
          </Section>

          {/* Section 5: Storage */}
          <Section label="Storage">
            <SmartDropdown
              label="Storage location"
              items={locations}
              value={watch('location_id')}
              onChange={(id, item) => { setValue('location_id', id); setSelectedLocation(item) }}
              placeholder="Select a storage location…"
              onAddNew={(name) => addLocationMutation.mutateAsync(name)}
              addLabel="Add location"
              renderItem={(loc) => (
                <span className="flex items-center gap-2">
                  {loc.is_dry_box && (
                    <span className="rounded-full bg-accent-900/40 border border-accent-700/40 px-1.5 py-0 text-xs text-accent-300">
                      Dry box
                    </span>
                  )}
                  {loc.name}
                  {loc.description && (
                    <span className="text-xs text-gray-500">· {loc.description}</span>
                  )}
                </span>
              )}
            />
          </Section>

          {/* Section 6: Purchase & Supplier */}
          <Section label="Purchase & Supplier">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Supplier" placeholder="e.g. Amazon, local shop…" {...register('supplier')} />
              <Input label="Purchase date" type="date" {...register('purchase_date')} />
            </div>
            <div className="flex flex-col gap-1">
              <Input
                label="Product URL"
                type="url"
                placeholder="https://…"
                {...register('product_url')}
                error={errors.product_url?.message}
              />
              <URLPreview url={watchedUrl} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Cost paid"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register('purchase_price')}
              />
            </div>
          </Section>

          {/* Section 7: Notes */}
          <Section label="Notes">
            <textarea
              {...register('notes')}
              rows={4}
              placeholder="Any notes about this spool — lot number quirks, where you bought it, print tips…"
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
            diameter={watchedDiameter}
            initialWeight={watchedInitial}
            usedWeight={watchedUsed}
            printTempMin={watchedTempMin}
            printTempMax={watchedTempMax}
          />
        </div>
      </div>

      {/* ── Sticky footer ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-surface-border bg-surface/90 backdrop-blur px-5 lg:px-7 py-3">
        <div className="flex items-center justify-end gap-3 max-w-5xl mx-auto">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/spools')}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={submitMutation.isPending && submitMutation.variables?.status === 'archived'}
            onClick={handleSubmit((data) => submitMutation.mutate({ data, status: 'archived' }))}
          >
            Save as Draft
          </Button>
          <Button
            type="button"
            loading={submitMutation.isPending && submitMutation.variables?.status === 'active'}
            onClick={handleSubmit(
              (data) => {
                setSubmitError('')
                submitMutation.mutate({ data, status: 'active' })
              },
              () => setSubmitError('Please fix the errors above before submitting.'),
            )}
          >
            Add Spool
          </Button>
        </div>
      </div>
    </div>
  )
}
