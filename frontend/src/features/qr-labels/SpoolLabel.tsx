import type { ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { SpoolResponse } from '@/types/api'

export type LabelTemplate =
  | 'classic-badge'
  | 'wide-card'
  | 'slim-tag'
  | 'micro-strip'
  | 'square-classic'
  | 'tall-card'
  | 'narrow-portrait'

export type QrEncoding = 'url' | 'id' | 'summary'

// ── Slot system ───────────────────────────────────────────────────────────────

export type ClassicFieldOption =
  | 'nozzle' | 'bed' | 'id' | 'color'
  | 'fill' | 'fill_bar' | 'weight' | 'material' | 'diameter' | 'brand' | 'name'
  | 'color_family' | 'color_name' | 'none'

export interface ClassicSlot {
  field:   ClassicFieldOption
  enabled: boolean
}

export const CLASSIC_FIELD_OPTIONS: { value: ClassicFieldOption; label: string }[] = [
  { value: 'nozzle',   label: 'Nozzle Temp' },
  { value: 'bed',      label: 'Bed Temp' },
  { value: 'id',       label: 'Spool ID' },
  { value: 'color',    label: 'Color Hex' },
  { value: 'fill',     label: 'Fill %' },
  { value: 'fill_bar', label: 'Fill Bar (visual)' },
  { value: 'weight',   label: 'Remaining Weight' },
  { value: 'material', label: 'Material' },
  { value: 'diameter', label: 'Diameter' },
  { value: 'brand',    label: 'Brand' },
  { value: 'name',         label: 'Spool Name' },
  { value: 'color_family', label: 'Color Family' },
  { value: 'color_name',   label: 'Color Name' },
  { value: 'none',         label: '— None —' },
]

export const CLASSIC_FIELD_LABELS: Record<ClassicFieldOption, string> = {
  nozzle:   'Nozzle:',
  bed:      'Bed Temp:',
  id:       'ID:',
  color:    'Color:',
  fill:     'Fill:',
  fill_bar: '',
  weight:   'Weight:',
  material: 'Material:',
  diameter: 'Diameter:',
  brand:    'Brand:',
  name:         'Name:',
  color_family: 'Color:',
  color_name:   'Name:',
  none:         '',
}

export const TEMPLATE_DEFAULT_SLOTS: Record<LabelTemplate, ClassicSlot[]> = {
  'classic-badge':   [
    { field: 'nozzle',   enabled: true },
    { field: 'bed',      enabled: true },
    { field: 'id',       enabled: true },
    { field: 'color',    enabled: true },
  ],
  'wide-card':       [
    { field: 'material', enabled: true },
    { field: 'weight',   enabled: true },
    { field: 'nozzle',   enabled: true },
    { field: 'fill_bar', enabled: true },
  ],
  'slim-tag':        [
    { field: 'weight',   enabled: true },
    { field: 'nozzle',   enabled: true },
    { field: 'fill_bar', enabled: true },
  ],
  'micro-strip':     [
    { field: 'material', enabled: true },
    { field: 'fill_bar', enabled: true },
  ],
  'square-classic':  [
    { field: 'weight',   enabled: true },
    { field: 'fill_bar', enabled: true },
  ],
  'tall-card':       [
    { field: 'weight',   enabled: true },
    { field: 'nozzle',   enabled: true },
    { field: 'fill_bar', enabled: true },
  ],
  'narrow-portrait': [
    { field: 'material', enabled: true },
    { field: 'weight',   enabled: true },
    { field: 'fill_bar', enabled: true },
  ],
}

// Kept for any external consumers that imported it before
export const DEFAULT_CLASSIC_SLOTS = TEMPLATE_DEFAULT_SLOTS['classic-badge']

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  spool:      SpoolResponse
  template:   LabelTemplate
  slots?:     ClassicSlot[]
  encoding:   QrEncoding
  className?: string
}

type TemplateProps = { spool: SpoolResponse; encoding: QrEncoding; slots: ClassicSlot[] }

// ── Color family derivation ───────────────────────────────────────────────────

export function hexToColorFamily(hex: string | null): string {
  if (!hex) return '—'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (l < 26)  return 'Black'
  if (l > 229) return 'White'
  const s = max === min ? 0 : l < 128 ? (max - min) / (max + min) : (max - min) / (510 - max - min)
  if (s < 0.15) return 'Gray'
  let h = 0
  if (max === r) h = ((g - b) / (max - min)) % 6
  else if (max === g) h = (b - r) / (max - min) + 2
  else h = (r - g) / (max - min) + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  if (h < 15 || h >= 345) return 'Red'
  if (h < 45)  return 'Orange'
  if (h < 70)  return 'Yellow'
  if (h < 150) return 'Green'
  if (h < 195) return 'Teal'
  if (h < 255) return 'Blue'
  if (h < 300) return 'Purple'
  return 'Pink'
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function qrValue(spool: SpoolResponse, encoding: QrEncoding): string {
  const fp = spool.filament
  switch (encoding) {
    case 'url':     return `${window.location.origin}/s/${spool.id}`
    case 'id':      return `FH-${spool.id}`
    case 'summary': {
      const parts = [
        fp?.brand?.name ?? spool.brand?.name,
        spool.name ?? fp?.name,
        fp?.material,
        `${spool.fill_percentage.toFixed(0)}%`,
      ].filter(Boolean)
      return parts.join(' | ')
    }
  }
}

function getSlotValue(field: ClassicFieldOption, spool: SpoolResponse): ReactNode {
  const fp = spool.filament
  switch (field) {
    case 'nozzle':   return (fp?.print_temp_min || fp?.print_temp_max)
      ? <TempRange min={fp.print_temp_min} max={fp.print_temp_max} /> : '—'
    case 'bed':      return (fp?.bed_temp_min || fp?.bed_temp_max)
      ? <TempRange min={fp.bed_temp_min} max={fp.bed_temp_max} /> : '—'
    case 'id':       return `${spool.id}`
    case 'color':    return fp?.color_hex ?? spool.color_hex ?? '—'
    case 'fill':     return `${spool.fill_percentage.toFixed(0)}%`
    case 'fill_bar': return null
    case 'weight':   return `${spool.remaining_weight.toFixed(0)}g`
    case 'material': return fp?.material ?? '—'
    case 'diameter': return fp?.diameter ? `${fp.diameter}mm` : '—'
    case 'brand':    return fp?.brand?.name ?? spool.brand?.name ?? '—'
    case 'name':         return spool.name ?? fp?.name ?? '—'
    case 'color_family': return hexToColorFamily(fp?.color_hex ?? spool.color_hex ?? null)
    case 'color_name':   return fp?.color_name ?? '—'
    case 'none':         return null
  }
}

function TempRange({ min, max }: { min: number | null; max: number | null }) {
  if (!min && !max) return null
  return <>{min && max ? `${min}–${max}°C` : min ? `${min}°C` : `${max}°C`}</>
}

function FillBar({ pct, hex, compact }: { pct: number; hex: string | null; compact?: boolean }) {
  const bg = hex ?? '#6366f1'
  return (
    <div className="flex items-center gap-1">
      <div className={`flex-1 rounded-full bg-gray-200 overflow-hidden ${compact ? 'h-1' : 'h-1.5'}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: bg }} />
      </div>
      <span className={`font-semibold tabular-nums text-gray-600 text-right shrink-0 ${compact ? 'text-[7px] w-5' : 'text-[9px] w-6'}`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function SpoolRingIcon({ color, size = 18 }: { color: string | null; size?: number }) {
  const c = color ?? '#6366f1'
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="9"   fill={c} opacity="0.8" />
      <circle cx="10" cy="10" r="4"   fill="white" />
      <circle cx="10" cy="10" r="1.5" fill={c} opacity="0.4" />
    </svg>
  )
}

// Renders a single label:value slot row; returns null for fill_bar / none / empty
function SlotRow({ slot, spool, compact }: { slot: ClassicSlot; spool: SpoolResponse; compact?: boolean }) {
  if (!slot.enabled || slot.field === 'none' || slot.field === 'fill_bar') return null
  const value = getSlotValue(slot.field, spool)
  if (value === null) return null
  const label = CLASSIC_FIELD_LABELS[slot.field]
  const sz = compact ? 'text-[7px]' : 'text-[7.5px]'
  return (
    <div className="flex items-baseline gap-1 leading-none">
      {label && <span className={`${sz} text-gray-400 shrink-0 w-[40px]`}>{label}</span>}
      <span className={`${sz} font-semibold text-gray-800 truncate`}>{value}</span>
    </div>
  )
}

// ── 1. Classic Badge (40×30mm) ────────────────────────────────────────────────
// Large brand | dark material bar + hex | [left: name + data rows | right: QR full-height]
function ClassicBadgeLabel({ spool, encoding, slots }: TemplateProps) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const brand = fp?.brand?.name ?? spool.brand?.name ?? 'Unknown'
  const mat   = fp?.material ?? '—'
  const name  = spool.name ?? fp?.name ?? '—'
  const textSlots = slots.filter((s) => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-2 pt-1.5 pb-0 shrink-0">
        <p className="text-[14px] font-black text-gray-900 leading-none tracking-tight uppercase truncate">{brand}</p>
      </div>
      <div className="flex items-center gap-1 px-2 py-[3px] bg-gray-900 shrink-0 mt-1">
        <p className="text-[9px] font-bold text-white flex-1 truncate">
          {mat}{fp?.diameter ? ` · ${fp.diameter}mm` : ''}
        </p>
        {hex && <p className="text-[7.5px] font-mono text-gray-300 shrink-0">{hex}</p>}
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 px-2 pt-1 pb-1.5">
          <p className="text-[9px] font-bold text-gray-800 leading-tight truncate shrink-0">{name}</p>
          <div className="flex flex-col justify-around flex-1 min-h-0">
            {textSlots.map((slot, i) => (
              <SlotRow key={i} slot={slot} spool={spool} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center px-1.5 pt-1 pb-1.5 shrink-0">
          <QRCodeSVG value={qrValue(spool, encoding)} size={62} level="M" />
        </div>
      </div>
    </div>
  )
}

// ── 2. Wide Card (50×30mm) ────────────────────────────────────────────────────
// Color stripe | [left: brand + name + data rows + fill bar | right: QR full-height]
function WideCardLabel({ spool, encoding, slots }: TemplateProps) {
  const fp       = spool.filament
  const hex      = fp?.color_hex ?? spool.color_hex ?? null
  const name     = spool.name ?? fp?.name ?? '—'
  const brand    = fp?.brand?.name ?? spool.brand?.name ?? ''
  const textSlots  = slots.filter((s) => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFillBar = slots.some((s) => s.enabled && s.field === 'fill_bar')

  return (
    <div className="flex h-full">
      <div className="w-2 shrink-0 rounded-l" style={{ backgroundColor: hex ?? '#6366f1' }} />
      <div className="flex flex-col flex-1 px-2 py-1.5 gap-1 min-w-0">
        {brand && (
          <p className="text-[7px] text-gray-400 uppercase tracking-wide leading-none truncate">{brand}</p>
        )}
        <p className="text-[11px] font-bold text-gray-900 leading-tight truncate">{name}</p>
        <div className="flex flex-col gap-0.5 flex-1 min-h-0 justify-center">
          {textSlots.map((slot, i) => (
            <SlotRow key={i} slot={slot} spool={spool} compact />
          ))}
        </div>
        {hasFillBar && <FillBar pct={spool.fill_percentage} hex={hex} />}
      </div>
      <div className="flex items-center justify-center px-2 shrink-0">
        <QRCodeSVG value={qrValue(spool, encoding)} size={68} level="M" />
      </div>
    </div>
  )
}

// ── 3. Slim Tag (40×24mm) ─────────────────────────────────────────────────────
// Colored header (brand + material) | QR left | name + configurable data | optional fill bar
function SlimTagLabel({ spool, encoding, slots }: TemplateProps) {
  const fp       = spool.filament
  const hex      = fp?.color_hex ?? spool.color_hex ?? null
  const name     = spool.name ?? fp?.name ?? '—'
  const brand    = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat      = fp?.material ?? '—'
  const textSlots  = slots.filter((s) => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFillBar = slots.some((s) => s.enabled && s.field === 'fill_bar')

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-1.5 py-px shrink-0"
        style={{ backgroundColor: hex ?? '#6366f1' }}
      >
        {brand
          ? <span className="text-[7px] font-semibold text-white/90 truncate">{brand}</span>
          : <span />
        }
        <span className="text-[7px] text-white/80 ml-auto shrink-0">
          {mat}{fp?.diameter ? ` · ${fp.diameter}mm` : ''}
        </span>
      </div>
      <div className="flex flex-1 min-h-0 gap-1 px-1 py-0.5">
        <div className="shrink-0 self-center">
          <QRCodeSVG value={qrValue(spool, encoding)} size={56} level="M" />
        </div>
        <div className="flex flex-col justify-center gap-0.5 min-w-0 flex-1">
          <p className="text-[10px] font-bold text-gray-900 leading-tight truncate">{name}</p>
          {textSlots.map((slot, i) => (
            <SlotRow key={i} slot={slot} spool={spool} compact />
          ))}
        </div>
      </div>
      {hasFillBar && (
        <div className="px-1 pb-0.5 shrink-0">
          <FillBar pct={spool.fill_percentage} hex={hex} compact />
        </div>
      )}
    </div>
  )
}

// ── 4. Micro Strip (40×12mm) ──────────────────────────────────────────────────
// Color stripe | QR | spool name | one configurable secondary line | optional fill bar
function MicroStripLabel({ spool, encoding, slots }: TemplateProps) {
  const fp         = spool.filament
  const hex        = fp?.color_hex ?? spool.color_hex ?? null
  const name       = spool.name ?? fp?.name ?? '—'
  const textSlot   = slots.find((s) => s.enabled && s.field !== 'fill_bar' && s.field !== 'none')
  const hasFillBar = slots.some((s) => s.enabled && s.field === 'fill_bar')
  const secondary  = textSlot ? getSlotValue(textSlot.field, spool) : null

  return (
    <div className="flex h-full items-center">
      <div className="w-1.5 h-full rounded-l shrink-0" style={{ backgroundColor: hex ?? '#6366f1' }} />
      <div className="px-1 shrink-0">
        <QRCodeSVG value={qrValue(spool, encoding)} size={36} level="L" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <p className="text-[8px] font-bold text-gray-900 truncate leading-none">{name}</p>
        {secondary && (
          <p className="text-[7px] text-gray-500 truncate leading-none">{secondary}</p>
        )}
      </div>
      {hasFillBar && (
        <div className="w-14 px-1 shrink-0">
          <FillBar pct={spool.fill_percentage} hex={hex} compact />
        </div>
      )}
    </div>
  )
}

// ── 5. Square Classic (40×30mm) ───────────────────────────────────────────────
// Color stripe | brand + name + material centered | QR center | configurable footer
function SquareClassicLabel({ spool, encoding, slots }: TemplateProps) {
  const fp       = spool.filament
  const hex      = fp?.color_hex ?? spool.color_hex ?? null
  const name     = spool.name ?? fp?.name ?? '—'
  const brand    = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat      = fp?.material ?? '—'
  const textSlots  = slots.filter((s) => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFillBar = slots.some((s) => s.enabled && s.field === 'fill_bar')

  return (
    <div className="flex h-full">
      <div className="w-2 shrink-0 rounded-l" style={{ backgroundColor: hex ?? '#6366f1' }} />
      <div className="flex flex-col flex-1 items-center justify-between px-1.5 py-1.5 min-w-0">
        <div className="text-center min-w-0 w-full">
          {brand && (
            <p className="text-[7px] text-gray-400 uppercase tracking-wide leading-none">{brand}</p>
          )}
          <p className="text-[11px] font-bold text-gray-900 leading-tight truncate">{name}</p>
          <p className="text-[8px] text-gray-500 leading-none">
            {mat}{fp?.diameter ? ` · ${fp.diameter}mm` : ''}
          </p>
        </div>
        <QRCodeSVG value={qrValue(spool, encoding)} size={54} level="M" />
        <div className="w-full space-y-0.5">
          {textSlots.map((slot, i) => (
            <SlotRow key={i} slot={slot} spool={spool} compact />
          ))}
          {hasFillBar && <FillBar pct={spool.fill_percentage} hex={hex} compact />}
        </div>
      </div>
    </div>
  )
}

// ── 6. Tall Card (30×40mm) ────────────────────────────────────────────────────
// Colored header (spool ring + brand) | name + material | QR center | configurable footer
function TallCardLabel({ spool, encoding, slots }: TemplateProps) {
  const fp       = spool.filament
  const hex      = fp?.color_hex ?? spool.color_hex ?? null
  const name     = spool.name ?? fp?.name ?? '—'
  const brand    = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat      = fp?.material ?? '—'
  const textSlots  = slots.filter((s) => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFillBar = slots.some((s) => s.enabled && s.field === 'fill_bar')

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-center gap-1 px-1.5 py-1 shrink-0"
        style={{ backgroundColor: hex ?? '#6366f1' }}
      >
        <SpoolRingIcon color="#ffffff" size={13} />
        {brand && <span className="text-[7px] font-semibold text-white/90 truncate">{brand}</span>}
      </div>
      <div className="text-center px-1.5 pt-1 shrink-0">
        <p className="text-[10px] font-bold text-gray-900 leading-tight">{name}</p>
        <p className="text-[7px] text-gray-500 leading-none mt-0.5">
          {mat}{fp?.diameter ? ` · ${fp.diameter}mm` : ''}
        </p>
      </div>
      <div className="flex justify-center py-1.5 flex-1 items-center">
        <QRCodeSVG value={qrValue(spool, encoding)} size={64} level="M" />
      </div>
      <div className="px-1.5 pb-1.5 shrink-0 space-y-0.5">
        {textSlots.map((slot, i) => (
          <SlotRow key={i} slot={slot} spool={spool} compact />
        ))}
        {hasFillBar && <FillBar pct={spool.fill_percentage} hex={hex} compact />}
      </div>
    </div>
  )
}

// ── 7. Narrow Portrait (25×40mm) ─────────────────────────────────────────────
// Color top stripe | QR center | spool name | configurable compact values | optional fill bar
function NarrowPortraitLabel({ spool, encoding, slots }: TemplateProps) {
  const fp       = spool.filament
  const hex      = fp?.color_hex ?? spool.color_hex ?? null
  const name     = spool.name ?? fp?.name ?? '—'
  const textSlots  = slots.filter((s) => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFillBar = slots.some((s) => s.enabled && s.field === 'fill_bar')

  return (
    <div className="flex flex-col h-full">
      <div className="h-2 rounded-t shrink-0" style={{ backgroundColor: hex ?? '#6366f1' }} />
      <div className="flex justify-center pt-1.5 shrink-0">
        <QRCodeSVG value={qrValue(spool, encoding)} size={68} level="M" />
      </div>
      <div className="flex flex-col items-center px-1 pt-1 pb-1 flex-1 gap-0.5 min-h-0">
        <p className="text-[8px] font-bold text-gray-900 leading-tight text-center w-full truncate">{name}</p>
        {textSlots.map((slot, i) => {
          const value = getSlotValue(slot.field, spool)
          return value ? (
            <p key={i} className="text-[7px] text-gray-500 leading-none text-center">{value}</p>
          ) : null
        })}
      </div>
      {hasFillBar && (
        <div className="px-1.5 pb-1.5 shrink-0">
          <FillBar pct={spool.fill_percentage} hex={hex} compact />
        </div>
      )}
    </div>
  )
}

// ── Size map (screen px at 96 dpi, 1 mm ≈ 3.7795 px) ────────────────────────

export const LABEL_PX: Record<LabelTemplate, { w: number; h: number }> = {
  'classic-badge':   { w: 151, h: 113 },  // 40×30 mm
  'wide-card':       { w: 189, h: 113 },  // 50×30 mm
  'slim-tag':        { w: 151, h:  91 },  // 40×24 mm
  'micro-strip':     { w: 151, h:  45 },  // 40×12 mm
  'square-classic':  { w: 151, h: 113 },  // 40×30 mm
  'tall-card':       { w: 113, h: 151 },  // 30×40 mm
  'narrow-portrait': { w:  95, h: 151 },  // 25×40 mm
}

// ── Public component ──────────────────────────────────────────────────────────

export function SpoolLabel({ spool, template, slots, encoding, className = '' }: Props) {
  const { w, h } = LABEL_PX[template]
  const resolvedSlots = slots ?? TEMPLATE_DEFAULT_SLOTS[template]

  return (
    <div
      className={`${className} rounded border border-gray-300 bg-white shadow-sm overflow-hidden select-none`}
      style={{ width: w, height: h }}
    >
      {template === 'classic-badge'   && <ClassicBadgeLabel   spool={spool} encoding={encoding} slots={resolvedSlots} />}
      {template === 'wide-card'       && <WideCardLabel       spool={spool} encoding={encoding} slots={resolvedSlots} />}
      {template === 'slim-tag'        && <SlimTagLabel        spool={spool} encoding={encoding} slots={resolvedSlots} />}
      {template === 'micro-strip'     && <MicroStripLabel     spool={spool} encoding={encoding} slots={resolvedSlots} />}
      {template === 'square-classic'  && <SquareClassicLabel  spool={spool} encoding={encoding} slots={resolvedSlots} />}
      {template === 'tall-card'       && <TallCardLabel       spool={spool} encoding={encoding} slots={resolvedSlots} />}
      {template === 'narrow-portrait' && <NarrowPortraitLabel spool={spool} encoding={encoding} slots={resolvedSlots} />}
    </div>
  )
}
