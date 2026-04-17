import { useState, useMemo, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, LayoutGrid, List, RefreshCw, Download, ExternalLink,
  Star, X, ChevronRight, Check, Database, Users, Package, Sparkles,
} from 'lucide-react'
import { communityApi } from '@/api/community'
import { locationsApi } from '@/api/locations'
import { Button } from '@/components/ui/Button'
import { formatRelative } from '@/utils/format'
import type { CommunityFilament } from '@/api/community'

// ── Constants ─────────────────────────────────────────────────────────────────

const MATERIALS = [
  'PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'Nylon', 'PC',
  'PLA-CF', 'PETG-CF', 'ABS-CF10', 'Silk', 'Wood', 'Flexible (TPU)',
]

const COLOR_FAMILIES = [
  { key: 'red',    hex: '#EF4444', label: 'Red'    },
  { key: 'orange', hex: '#F97316', label: 'Orange' },
  { key: 'yellow', hex: '#EAB308', label: 'Yellow' },
  { key: 'green',  hex: '#22C55E', label: 'Green'  },
  { key: 'cyan',   hex: '#06B6D4', label: 'Cyan'   },
  { key: 'blue',   hex: '#3B82F6', label: 'Blue'   },
  { key: 'indigo', hex: '#6366F1', label: 'Indigo' },
  { key: 'purple', hex: '#A855F7', label: 'Purple' },
  { key: 'pink',   hex: '#EC4899', label: 'Pink'   },
  { key: 'white',  hex: '#F8FAFC', label: 'White'  },
  { key: 'black',  hex: '#111827', label: 'Black'  },
  { key: 'gray',   hex: '#6B7280', label: 'Gray'   },
  { key: 'gold',   hex: '#F59E0B', label: 'Gold'   },
  { key: 'silver', hex: '#94A3B8', label: 'Silver' },
]

const SPECIAL_TAGS = [
  { key: 'glow',        label: 'Glow-in-dark',  color: 'text-green-400'  },
  { key: 'metallic',    label: 'Metallic',       color: 'text-yellow-400' },
  { key: 'translucent', label: 'Transparent',    color: 'text-cyan-400'   },
  { key: 'marble',      label: 'Marble',         color: 'text-purple-400' },
  { key: 'wood',        label: 'Wood fill',      color: 'text-amber-500'  },
  { key: 'carbon',      label: 'Carbon fiber',   color: 'text-gray-300'   },
  { key: 'multicolor',  label: 'Multi-color',    color: 'text-pink-400'   },
]

const PAGE_SIZE = 24
const IMPORTS_KEY = 'fh_community_imports'

// ── Utilities ─────────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    case b: h = ((r - g) / d + 4) / 6; break
  }
  return [h * 360, s * 100, l * 100]
}

function colorFamily(hex: string | null): string {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return 'gray'
  const [h, s, l] = hexToHsl(hex)
  if (s < 12) {
    if (l > 78) return 'white'
    if (l < 22) return 'black'
    return 'gray'
  }
  if (l > 72 && s < 25) return 'silver'
  if (h >= 345 || h < 15)  return 'red'
  if (h >= 15  && h < 45)  return 'orange'
  if (h >= 45  && h < 70)  return s > 55 ? 'gold' : 'yellow'
  if (h >= 70  && h < 165) return 'green'
  if (h >= 165 && h < 195) return 'cyan'
  if (h >= 195 && h < 258) return 'blue'
  if (h >= 258 && h < 290) return 'indigo'
  if (h >= 290 && h < 330) return 'purple'
  return 'pink'
}

function computeRating(f: CommunityFilament): number {
  let score = 2.0
  if (f.print_temp_min != null) score += 0.5
  if (f.print_temp_max != null) score += 0.5
  if (f.bed_temp_min   != null) score += 0.5
  if (f.density        != null) score += 0.5
  const w = f.weights?.[0]
  if (w?.spool_weight  != null) score += 0.5
  if (w?.weight        != null) score += 0.5
  return Math.min(5, score)
}

function loadImports(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(IMPORTS_KEY) || '[]')) }
  catch { return new Set() }
}
function saveImports(ids: Set<string>) {
  localStorage.setItem(IMPORTS_KEY, JSON.stringify([...ids]))
}

// ── StarRating ────────────────────────────────────────────────────────────────

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${sz} ${i <= rating ? 'text-yellow-400 fill-yellow-400' : i - 0.5 <= rating ? 'text-yellow-400 fill-yellow-400/40' : 'text-gray-600'}`}
        />
      ))}
    </div>
  )
}

// ── SpecChip ──────────────────────────────────────────────────────────────────

function SpecChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-surface-border bg-surface-3 px-2 py-0.5 text-xs text-gray-400">
      {children}
    </span>
  )
}

// ── FilamentCard ──────────────────────────────────────────────────────────────

function FilamentCard({
  f, imported, onImport, onDetail,
}: {
  f: CommunityFilament
  imported: boolean
  onImport: () => void
  onDetail: () => void
}) {
  const rating = computeRating(f)
  const weight = f.weights?.[0]?.weight ?? 1000
  const tags: string[] = []
  if (f.glow)        tags.push('Glow')
  if (f.is_metallic) tags.push('Metallic')
  if (f.translucent) tags.push('Clear')
  if (f.pattern === 'marble') tags.push('Marble')
  if (f.pattern === 'sparkle') tags.push('Sparkle')
  if (f.is_wood)     tags.push('Wood')
  if (f.is_carbon)   tags.push('CF')
  if (f.multi_color) tags.push('Multi')

  return (
    <div
      className="rounded-xl border border-surface-border bg-surface-1 p-4 flex flex-col gap-3 cursor-pointer hover:border-primary-700/40 transition-colors"
      onClick={onDetail}
    >
      {/* Header: swatch + name */}
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded-lg border border-white/10"
          style={{ backgroundColor: f.color_hex ?? '#374151' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white leading-tight">{f.name}</p>
          <p className="truncate text-xs text-gray-500">{f.manufacturer}</p>
        </div>
        {imported && (
          <span className="shrink-0 rounded-full bg-green-900/40 border border-green-700/40 px-2 py-0.5 text-xs font-medium text-green-400 flex items-center gap-1">
            <Check className="h-3 w-3" /> Imported
          </span>
        )}
      </div>

      {/* Spec chips */}
      <div className="flex flex-wrap gap-1.5">
        <SpecChip>{f.material}</SpecChip>
        <SpecChip>{f.diameter}mm</SpecChip>
        <SpecChip>{weight}g</SpecChip>
        {f.print_temp_min != null && (
          <SpecChip>{f.print_temp_min}–{f.print_temp_max}°C</SpecChip>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 border border-surface-border px-1.5 py-0.5 text-xs text-gray-400">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Footer: rating + import */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <StarRating rating={rating} />
        <button
          onClick={(e) => { e.stopPropagation(); onImport() }}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            imported
              ? 'bg-green-900/20 border border-green-700/30 text-green-400 hover:bg-green-900/30'
              : 'bg-primary-600/20 border border-primary-700/30 text-primary-300 hover:bg-primary-600/30'
          }`}
        >
          {imported ? '+ Import again' : '+ Import'}
        </button>
      </div>
    </div>
  )
}

// ── FilamentRow ───────────────────────────────────────────────────────────────

function FilamentRow({
  f, imported, onImport, onDetail,
}: {
  f: CommunityFilament
  imported: boolean
  onImport: () => void
  onDetail: () => void
}) {
  const rating = computeRating(f)
  const weight = f.weights?.[0]?.weight ?? 1000

  return (
    <tr
      className="group border-b border-surface-border hover:bg-surface-2 cursor-pointer transition-colors"
      onClick={onDetail}
    >
      <td className="px-3 py-2.5">
        <div className="h-5 w-5 rounded border border-white/10" style={{ backgroundColor: f.color_hex ?? '#374151' }} />
      </td>
      <td className="px-3 py-2.5">
        <p className="text-sm font-medium text-white">{f.name}</p>
        <p className="text-xs text-gray-500">{f.manufacturer}</p>
      </td>
      <td className="px-3 py-2.5">
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-gray-300">{f.material}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">{f.diameter}mm</td>
      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">
        {f.print_temp_min != null ? `${f.print_temp_min}–${f.print_temp_max}°C` : '—'}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">{weight}g</td>
      <td className="px-3 py-2.5"><StarRating rating={rating} /></td>
      <td className="px-3 py-2.5">
        {imported ? (
          <span className="rounded-full bg-green-900/40 border border-green-700/30 px-2 py-0.5 text-xs text-green-400 flex items-center gap-1 w-fit">
            <Check className="h-3 w-3" /> Imported
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onImport() }}
            className="opacity-0 group-hover:opacity-100 rounded-lg bg-primary-600/20 border border-primary-700/30 px-2.5 py-1 text-xs font-medium text-primary-300 hover:bg-primary-600/30 transition-all"
          >
            + Import
          </button>
        )}
      </td>
    </tr>
  )
}

// ── ImportModal ───────────────────────────────────────────────────────────────

function ImportModal({
  filament,
  onClose,
  onSuccess,
}: {
  filament: CommunityFilament
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [weight, setWeight]       = useState(String(filament.weights?.[0]?.weight ?? 1000))
  const [spoolWeight, setSpoolW]  = useState(String(filament.weights?.[0]?.spool_weight ?? ''))
  const [cost, setCost]           = useState('')
  const [locationId, setLocId]    = useState<number | undefined>()

  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list })
  const queryClient = useQueryClient()

  const importMutation = useMutation({
    mutationFn: () =>
      communityApi.import({
        manufacturer:    filament.manufacturer,
        name:            filament.name,
        material:        filament.material,
        color_name:      filament.color_name ?? undefined,
        color_hex:       filament.color_hex  ?? undefined,
        diameter:        filament.diameter,
        density:         filament.density    ?? undefined,
        print_temp_min:  filament.print_temp_min ?? undefined,
        print_temp_max:  filament.print_temp_max ?? undefined,
        bed_temp_min:    filament.bed_temp_min   ?? undefined,
        bed_temp_max:    filament.bed_temp_max   ?? undefined,
        initial_weight:  parseFloat(weight) || 1000,
        spool_weight:    spoolWeight ? parseFloat(spoolWeight) : undefined,
        purchase_price:  cost ? parseFloat(cost) : undefined,
        location_id:     locationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      setStep(3)
    },
  })

  const rating = computeRating(filament)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">
        {/* Step indicator */}
        <div className="flex border-b border-surface-border">
          {[
            { n: 1, label: 'Preview' },
            { n: 2, label: 'Configure' },
            { n: 3, label: 'Done' },
          ].map(({ n, label }) => (
            <div
              key={n}
              className={`flex-1 py-3 text-center text-xs font-medium border-b-2 transition-colors ${
                step === n
                  ? 'border-primary-500 text-primary-300'
                  : step > n
                  ? 'border-green-600 text-green-400'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {step > n ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />{label}</span> : label}
            </div>
          ))}
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Filament Profile</h2>
              {/* Color + name */}
              <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-2 p-3">
                <div
                  className="h-12 w-12 shrink-0 rounded-lg border border-white/10"
                  style={{ backgroundColor: filament.color_hex ?? '#374151' }}
                />
                <div>
                  <p className="text-base font-semibold text-white">{filament.name}</p>
                  <p className="text-sm text-gray-400">{filament.manufacturer}</p>
                </div>
                <div className="ml-auto text-right">
                  <StarRating rating={rating} size="md" />
                  <p className="text-xs text-gray-500 mt-0.5">{rating.toFixed(1)} / 5.0</p>
                </div>
              </div>
              {/* Spec grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Material',    filament.material],
                  ['Diameter',    `${filament.diameter}mm`],
                  ['Weight',      `${filament.weights?.[0]?.weight ?? 1000}g`],
                  ['Spool tare',  filament.weights?.[0]?.spool_weight ? `${filament.weights[0].spool_weight}g` : '—'],
                  ['Print temp',  filament.print_temp_min != null ? `${filament.print_temp_min}–${filament.print_temp_max}°C` : '—'],
                  ['Bed temp',    filament.bed_temp_min   != null ? `${filament.bed_temp_min}–${filament.bed_temp_max}°C`   : '—'],
                  ['Density',     filament.density ? `${filament.density} g/cm³` : '—'],
                  ['Color',       filament.color_name ?? '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
                    <p className="text-xs text-gray-500">{k}</p>
                    <p className="text-sm font-medium text-white">{v}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={() => setStep(2)}>Configure & Import <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Configure Spool</h2>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Starting weight (g)</label>
                <input
                  type="number" step="1" value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                />
                {/* Weight presets */}
                <div className="flex gap-1.5 mt-0.5">
                  {(filament.weights ?? []).map((w) => (
                    <button
                      key={w.weight}
                      type="button"
                      onClick={() => { setWeight(String(w.weight)); setSpoolW(String(w.spool_weight ?? '')) }}
                      className="rounded-full border border-surface-border bg-surface-2 px-2.5 py-0.5 text-xs text-gray-400 hover:bg-surface-3 hover:text-white transition-colors"
                    >
                      {w.weight}g
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Spool tare weight (g)</label>
                <input
                  type="number" step="1" placeholder="Optional"
                  value={spoolWeight}
                  onChange={(e) => setSpoolW(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Cost paid (optional)</label>
                <input
                  type="number" step="0.01" placeholder="0.00"
                  value={cost} onChange={(e) => setCost(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Storage location</label>
                <select
                  value={locationId ?? ''}
                  onChange={(e) => setLocId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                >
                  <option value="">— None —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              {importMutation.error && (
                <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-xs text-red-300">
                  {String(importMutation.error)}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
                <Button
                  loading={importMutation.isPending}
                  onClick={() => importMutation.mutate()}
                >
                  Add to inventory
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-900/40 border border-green-700/40">
                <Check className="h-7 w-7 text-green-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Spool added!</p>
                <p className="text-sm text-gray-400 mt-1">
                  <span className="text-white">{filament.name}</span> has been added to your inventory.
                </p>
              </div>
              <Button onClick={() => { onSuccess(); onClose() }}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DetailModal ───────────────────────────────────────────────────────────────

function DetailModal({ f, onClose, onImport }: { f: CommunityFilament; onClose: () => void; onImport: () => void }) {
  const rating   = computeRating(f)
  const tipsByMaterial: Record<string, string> = {
    PLA:  'Minimal warping — no enclosure needed. Great for prototypes and decorative parts.',
    PETG: 'Slightly hygroscopic; keep dry. Sticks well but can be stringy — tune retraction.',
    ABS:  'Use an enclosure to reduce warping. Acetone-smoothable for a glossy finish.',
    ASA:  'UV-resistant variant of ABS. Excellent for outdoor parts; similar print settings.',
    TPU:  'Flexible and impact-resistant. Print slowly (20–30mm/s) and use direct drive.',
    PA:   'Dry thoroughly before printing. Very strong; excellent layer adhesion when dry.',
  }
  const tip = tipsByMaterial[f.material] ?? `Tested community profile for ${f.material}. Check recommended temps before printing.`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface-1 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-surface-border">
          <div
            className="h-12 w-12 shrink-0 rounded-xl border border-white/10"
            style={{ backgroundColor: f.color_hex ?? '#374151' }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-white truncate">{f.name}</p>
            <p className="text-sm text-gray-400 truncate">{f.manufacturer}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Spec grid */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Specifications</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Material',    f.material],
                ['Diameter',    `${f.diameter}mm`],
                ['Weight',      `${f.weights?.[0]?.weight ?? 1000}g`],
                ['Spool tare',  f.weights?.[0]?.spool_weight ? `${f.weights[0].spool_weight}g` : '—'],
                ['Density',     f.density ? `${f.density} g/cm³` : '—'],
                ['Print temp',  f.print_temp_min != null ? `${f.print_temp_min}–${f.print_temp_max}°C` : '—'],
                ['Bed temp',    f.bed_temp_min   != null ? `${f.bed_temp_min}–${f.bed_temp_max}°C`   : '—'],
                ['Finish',      f.finish ?? '—'],
                ['Pattern',     f.pattern ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
                  <p className="text-xs text-gray-500">{k}</p>
                  <p className="text-sm font-medium text-white">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Special properties */}
          {(f.glow || f.is_metallic || f.translucent || f.is_carbon || f.is_wood || f.multi_color) && (
            <div className="flex flex-wrap gap-2">
              {f.glow        && <span className="rounded-full border border-green-700/40 bg-green-900/20 px-2.5 py-1 text-xs text-green-400">✦ Glow-in-dark</span>}
              {f.is_metallic && <span className="rounded-full border border-yellow-700/40 bg-yellow-900/20 px-2.5 py-1 text-xs text-yellow-400">✦ Metallic</span>}
              {f.translucent && <span className="rounded-full border border-cyan-700/40 bg-cyan-900/20 px-2.5 py-1 text-xs text-cyan-400">✦ Transparent</span>}
              {f.is_carbon   && <span className="rounded-full border border-gray-600/40 bg-gray-800/40 px-2.5 py-1 text-xs text-gray-300">✦ Carbon fiber</span>}
              {f.is_wood     && <span className="rounded-full border border-amber-700/40 bg-amber-900/20 px-2.5 py-1 text-xs text-amber-400">✦ Wood fill</span>}
              {f.multi_color && <span className="rounded-full border border-pink-700/40 bg-pink-900/20 px-2.5 py-1 text-xs text-pink-400">✦ Multi-color</span>}
            </div>
          )}

          {/* Rating */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Data completeness</p>
            <div className="flex items-center gap-3">
              <StarRating rating={rating} size="md" />
              <span className="text-sm text-gray-300">{rating.toFixed(1)} / 5.0</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-yellow-400 transition-all"
                style={{ width: `${(rating / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* Community tip */}
          <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Community tip</p>
            <p className="text-sm text-gray-300 leading-relaxed">{tip}</p>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={onImport}>+ Import to inventory</Button>
            <Button
              variant="secondary"
              as="a"
              onClick={() => window.open('https://github.com/Donkie/SpoolmanDB', '_blank')}
            >
              <ExternalLink className="h-4 w-4" /> GitHub
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabKey = 'browse' | 'trending' | 'new' | 'imports'

export default function CommunityPage() {
  const queryClient = useQueryClient()

  // ── Persistent import tracking ───────────────────────────────────────────
  const [importedIds, setImportedIds] = useState<Set<string>>(loadImports)

  function markImported(id: string) {
    setImportedIds((prev) => {
      const next = new Set(prev).add(id)
      saveImports(next)
      return next
    })
  }

  // ── UI state ─────────────────────────────────────────────────────────────
  const [tab,        setTab]        = useState<TabKey>('browse')
  const [view,       setView]       = useState<'grid' | 'table'>('grid')
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [matFilter,  setMatFilter]  = useState('')
  const [diaFilter,  setDiaFilter]  = useState('')
  const [colorFam,   setColorFam]   = useState('')
  const [tags,       setTags]       = useState<Set<string>>(new Set())
  const [minRating,  setMinRating]  = useState(0)
  const [importTarget, setImportTarget] = useState<CommunityFilament | null>(null)
  const [detailTarget, setDetailTarget] = useState<CommunityFilament | null>(null)

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['community', 'stats'],
    queryFn:  communityApi.stats,
    staleTime: 5 * 60_000,
  })

  const {
    data: listData, isLoading, isFetching, isError, error, refetch,
  } = useQuery({
    queryKey: ['community', 'filaments'],
    queryFn:  () => communityApi.list({ page_size: 5000 }),
    staleTime: 10 * 60_000,
    retry: 1,
  })

  const allItems = listData?.items ?? []

  // ── Sync mutation ─────────────────────────────────────────────────────────
  const [syncError, setSyncError] = useState('')

  const syncMutation = useMutation({
    mutationFn: communityApi.sync,
    onSuccess: () => {
      setSyncError('')
      // Invalidate then explicitly refetch — needed when prior query was in error state
      queryClient.invalidateQueries({ queryKey: ['community'] }).then(() => refetch())
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSyncError(`Sync failed: ${msg}`)
    },
  })

  // ── Toggle tag ────────────────────────────────────────────────────────────
  const toggleTag = useCallback((key: string) => {
    setTags((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setPage(1)
  }, [])

  // ── Filter + sort pipeline ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = allItems

    // Tab-level pre-filter
    if (tab === 'trending') {
      const topMats = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU']
      items = [...items].sort((a, b) => {
        const ai = topMats.indexOf(a.material)
        const bi = topMats.indexOf(b.material)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
    } else if (tab === 'new') {
      // "New additions" = special/unusual profiles first, then alphabetically
      items = [...items].sort((a, b) => {
        const aSpec = (a.glow || a.is_metallic || a.translucent || a.multi_color) ? 0 : 1
        const bSpec = (b.glow || b.is_metallic || b.translucent || b.multi_color) ? 0 : 1
        return aSpec - bSpec || a.manufacturer.localeCompare(b.manufacturer)
      })
    } else if (tab === 'imports') {
      items = items.filter((f) => importedIds.has(f.id))
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (f) =>
          f.manufacturer.toLowerCase().includes(q) ||
          f.name.toLowerCase().includes(q) ||
          f.material.toLowerCase().includes(q) ||
          (f.color_name ?? '').toLowerCase().includes(q),
      )
    }

    // Material filter
    if (matFilter) items = items.filter((f) => f.material === matFilter)

    // Diameter filter
    if (diaFilter) items = items.filter((f) => String(f.diameter) === diaFilter)

    // Color family filter
    if (colorFam) items = items.filter((f) => colorFamily(f.color_hex) === colorFam)

    // Special tags
    if (tags.has('glow'))        items = items.filter((f) => f.glow)
    if (tags.has('metallic'))    items = items.filter((f) => f.is_metallic)
    if (tags.has('translucent')) items = items.filter((f) => f.translucent)
    if (tags.has('marble'))      items = items.filter((f) => f.pattern === 'marble')
    if (tags.has('wood'))        items = items.filter((f) => f.is_wood)
    if (tags.has('carbon'))      items = items.filter((f) => f.is_carbon)
    if (tags.has('multicolor'))  items = items.filter((f) => f.multi_color)

    // Rating filter
    if (minRating > 0) items = items.filter((f) => computeRating(f) >= minRating)

    return items
  }, [allItems, tab, search, matFilter, diaFilter, colorFam, tags, minRating, importedIds])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, matFilter, diaFilter, colorFam, tags, minRating, tab])

  // ── Pagination ────────────────────────────────────────────────────────────
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Material counts ───────────────────────────────────────────────────────
  const matCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allItems.forEach((f) => { counts[f.material] = (counts[f.material] ?? 0) + 1 })
    return counts
  }, [allItems])

  const topMats = useMemo(() =>
    Object.entries(matCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 14),
    [matCounts])

  const hasFilters = search || matFilter || diaFilter || colorFam || tags.size > 0 || minRating > 0
  const synced_at  = listData?.synced_at ?? statsData?.synced_at

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-surface-1 via-primary-900/10 to-surface-1 border-b border-surface-border px-5 lg:px-7 py-7">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">Community Filament Database</h1>
              <p className="text-sm text-gray-400 mt-1">
                Powered by{' '}
                <a
                  href="https://github.com/Donkie/SpoolmanDB"
                  target="_blank" rel="noreferrer"
                  className="text-primary-400 hover:text-primary-300 transition-colors"
                >
                  SpoolmanDB
                </a>
                {' '}— a community-maintained open-source filament database.
              </p>
            </div>
            {/* Sync button */}
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => { setSyncError(''); syncMutation.mutate() }}
                disabled={syncMutation.isPending || isFetching}
                className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-gray-300 hover:bg-surface-3 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${(syncMutation.isPending || isFetching) ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? 'Syncing…' : isFetching ? 'Updating…' : 'Check for updates'}
              </button>
              {syncMutation.isSuccess && (
                <p className="text-xs text-green-400">Database updated successfully</p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { icon: Database, label: 'Profiles',     value: (statsData?.total_profiles ?? allItems.length).toLocaleString(), color: 'text-primary-400' },
              { icon: Package,  label: 'Brands',       value: (statsData?.total_brands ?? 0).toLocaleString(),                  color: 'text-accent-400'  },
              { icon: Users,    label: 'Contributors', value: (statsData?.contributor_count ?? 0).toLocaleString(),             color: 'text-green-400'   },
              { icon: Download, label: 'My Imports',   value: importedIds.size.toLocaleString(),                                color: 'text-yellow-400'  },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="rounded-xl border border-surface-border bg-surface-1/60 px-4 py-3 flex items-center gap-3">
                <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                <div>
                  <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {synced_at && (
            <p className="text-xs text-gray-600 mt-3">
              Last synced {formatRelative(synced_at)}
            </p>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 max-w-5xl mx-auto w-full gap-6 px-5 lg:px-7 py-5">

        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col gap-5 w-52 shrink-0">

          {/* Materials */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Material</p>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => { setMatFilter(''); setPage(1) }}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  !matFilter ? 'bg-primary-600/20 text-primary-300' : 'text-gray-400 hover:bg-surface-2 hover:text-white'
                }`}
              >
                <span>All</span>
                <span className="text-xs text-gray-600">{allItems.length.toLocaleString()}</span>
              </button>
              {topMats.map(([mat, count]) => (
                <button
                  key={mat}
                  onClick={() => { setMatFilter(matFilter === mat ? '' : mat); setPage(1) }}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    matFilter === mat ? 'bg-primary-600/20 text-primary-300' : 'text-gray-400 hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  <span>{mat}</span>
                  <span className="text-xs text-gray-600">{count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color palette */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Color</p>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_FAMILIES.map(({ key, hex, label }) => (
                <button
                  key={key}
                  title={label}
                  onClick={() => { setColorFam(colorFam === key ? '' : key); setPage(1) }}
                  className="h-6 w-6 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: hex,
                    borderColor: colorFam === key ? '#fff' : 'transparent',
                    boxShadow: colorFam === key ? '0 0 0 1px #6366f1' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Min. rating</p>
            <div className="flex flex-col gap-0.5">
              {[
                { label: 'Any', value: 0 },
                { label: '3+',  value: 3 },
                { label: '4+',  value: 4 },
                { label: '4.5+',value: 4.5 },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => { setMinRating(minRating === value ? 0 : value); setPage(1) }}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    minRating === value ? 'bg-primary-600/20 text-primary-300' : 'text-gray-400 hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  {value > 0 ? <StarRating rating={value} /> : null}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Special tags */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Type</p>
            <div className="flex flex-col gap-0.5">
              {SPECIAL_TAGS.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => toggleTag(key)}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    tags.has(key) ? 'bg-primary-600/20 text-primary-300' : 'text-gray-400 hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  <Sparkles className={`h-3.5 w-3.5 ${color}`} />
                  {label}
                  {tags.has(key) && <Check className="ml-auto h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Tabs */}
          <div className="flex border-b border-surface-border gap-1">
            {([
              { key: 'browse',   label: 'Browse All'     },
              { key: 'trending', label: 'Trending'       },
              { key: 'new',      label: 'New Additions'  },
              { key: 'imports',  label: `My Imports (${importedIds.size})` },
            ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === key
                    ? 'border-primary-500 text-primary-300'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Brand, name, material, color…"
                className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
              />
            </div>

            {/* Diameter */}
            <select
              value={diaFilter}
              onChange={(e) => { setDiaFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-gray-300 focus:border-primary-500 focus:outline-none"
            >
              <option value="">All diameters</option>
              <option value="1.75">1.75mm</option>
              <option value="2.85">2.85mm</option>
            </select>

            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setMatFilter(''); setDiaFilter(''); setColorFam(''); setTags(new Set()); setMinRating(0) }}
                className="flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-gray-500">{filtered.length.toLocaleString()} results</span>
              <div className="flex rounded-lg border border-surface-border bg-surface-2 p-0.5">
                <button
                  onClick={() => setView('grid')}
                  className={`rounded p-1.5 transition-colors ${view === 'grid' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView('table')}
                  className={`rounded p-1.5 transition-colors ${view === 'table' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Loading */}
          {(isLoading || (syncMutation.isPending && allItems.length === 0)) && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <RefreshCw className="h-8 w-8 text-gray-600 animate-spin" />
              <p className="text-sm text-gray-400">
                {syncMutation.isPending ? 'Syncing from GitHub…' : 'Loading community database from GitHub…'}
              </p>
              <p className="text-xs text-gray-600">Fetching 60+ manufacturer files — first load takes ~10–20 s.</p>
            </div>
          )}

          {/* Error state */}
          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-5 py-4 max-w-md">
                <p className="text-sm font-semibold text-red-300 mb-1">Failed to load community database</p>
                <p className="text-xs text-red-400/80 break-all">
                  {error instanceof Error ? error.message : 'The backend could not sync from GitHub. Check your network and try again.'}
                </p>
              </div>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-2 px-4 py-2 text-sm text-gray-300 hover:bg-surface-3 hover:text-white transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          )}

          {/* Sync error banner */}
          {syncError && (
            <div className="flex items-center gap-3 rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              <span className="flex-1">{syncError}</span>
              <button onClick={() => setSyncError('')} className="text-red-400 hover:text-red-300">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !isError && paged.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Database className="h-12 w-12 text-gray-600" />
              <p className="text-sm text-gray-400">
                {tab === 'imports' ? 'No imports yet. Browse and import filaments above.' : 'No filaments match the current filters.'}
              </p>
            </div>
          )}

          {/* Grid view */}
          {!isLoading && !isError && paged.length > 0 && view === 'grid' && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {paged.map((f) => (
                <FilamentCard
                  key={f.id}
                  f={f}
                  imported={importedIds.has(f.id)}
                  onImport={() => setImportTarget(f)}
                  onDetail={() => setDetailTarget(f)}
                />
              ))}
            </div>
          )}

          {/* Table view */}
          {!isLoading && !isError && paged.length > 0 && view === 'table' && (
            <div className="overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-surface-2 border-b border-surface-border">
                  <tr>
                    <th className="w-8 px-3 py-2.5" />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-24">Material</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">Diam.</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">Print temp</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">Weight</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">Rating</th>
                    <th className="px-3 py-2.5 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((f) => (
                    <FilamentRow
                      key={f.id}
                      f={f}
                      imported={importedIds.has(f.id)}
                      onImport={() => setImportTarget(f)}
                      onDetail={() => setDetailTarget(f)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {page} of {pageCount} · {filtered.length.toLocaleString()} results
              </p>
              <div className="flex items-center gap-1">
                <PgBtn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</PgBtn>
                {[...Array(Math.min(7, pageCount))].map((_, i) => {
                  const n = pageCount <= 7 ? i + 1 : (() => {
                    if (i === 0) return 1
                    if (i === 6) return pageCount
                    return Math.max(2, Math.min(pageCount - 1, page - 2 + i))
                  })()
                  return (
                    <PgBtn key={i} active={n === page} onClick={() => setPage(n)}>
                      {n}
                    </PgBtn>
                  )
                })}
                <PgBtn disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>›</PgBtn>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {importTarget && (
        <ImportModal
          filament={importTarget}
          onClose={() => setImportTarget(null)}
          onSuccess={() => markImported(importTarget.id)}
        />
      )}
      {detailTarget && (
        <DetailModal
          f={detailTarget}
          onClose={() => setDetailTarget(null)}
          onImport={() => { setDetailTarget(null); setImportTarget(detailTarget) }}
        />
      )}
    </div>
  )
}

// ── PgBtn ─────────────────────────────────────────────────────────────────────

function PgBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[32px] h-8 rounded-lg px-2 text-sm font-medium transition-colors
        ${active  ? 'bg-primary-600 text-white' : ''}
        ${!active && !disabled ? 'text-gray-400 hover:bg-surface-2 hover:text-white' : ''}
        ${disabled ? 'text-gray-700 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}
