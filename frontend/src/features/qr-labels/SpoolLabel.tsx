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

export interface LabelFields {
  brand:     boolean
  temps:     boolean
  bed_temps: boolean
  fill_bar:  boolean
  weight:    boolean
  lot:       boolean
  diameter:  boolean
}

export const DEFAULT_FIELDS: LabelFields = {
  brand:     true,
  temps:     true,
  bed_temps: false,
  fill_bar:  true,
  weight:    true,
  lot:       false,
  diameter:  true,
}

interface Props {
  spool:    SpoolResponse
  template: LabelTemplate
  fields:   LabelFields
  encoding: QrEncoding
  className?: string
}

function qrValue(spool: SpoolResponse, encoding: QrEncoding): string {
  const fp = spool.filament
  switch (encoding) {
    case 'url':
      return `${window.location.origin}/spools/${spool.id}`
    case 'id':
      return `FH-${spool.id}`
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

function TempRange({ min, max }: { min: number | null; max: number | null }) {
  if (!min && !max) return null
  return <>{min && max ? `${min}–${max}°C` : min ? `${min}°C` : `${max}°C`}</>
}

function FillBar({ pct, hex, compact }: { pct: number; hex: string | null; compact?: boolean }) {
  const bg = hex ?? '#6366f1'
  return (
    <div className="flex items-center gap-1">
      <div className={`flex-1 rounded-full bg-gray-200 overflow-hidden ${compact ? 'h-1' : 'h-1.5'}`}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: bg }}
        />
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

// ── 1. Classic Badge (40×30mm) ───────────────────────────────────────────────
// Colored header bar (brand + material) | QR left + data right | fill bar footer
function ClassicBadgeLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat   = fp?.material ?? '—'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-0.5 shrink-0"
        style={{ backgroundColor: hex ?? '#6366f1' }}
      >
        {fields.brand && brand
          ? <span className="text-[8px] font-semibold text-white/90 truncate">{brand}</span>
          : <span />
        }
        <span className="text-[8px] text-white/80 ml-auto shrink-0">
          {mat}{fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
        </span>
      </div>

      {/* Middle: QR + data */}
      <div className="flex flex-1 min-h-0 gap-1.5 px-1.5 py-1">
        <div className="shrink-0 self-center">
          <QRCodeSVG value={qrValue(spool, encoding)} size={50} level="M" />
        </div>
        <div className="flex flex-col justify-center gap-0.5 min-w-0 flex-1">
          <p className="text-[11px] font-bold text-gray-900 leading-tight truncate">{name}</p>
          {fields.weight && (
            <p className="text-[8px] text-gray-500 leading-none tabular-nums">
              {spool.remaining_weight.toFixed(0)}g / {spool.initial_weight.toFixed(0)}g
            </p>
          )}
          {fields.temps && (fp?.print_temp_min || fp?.print_temp_max) && (
            <p className="text-[8px] text-gray-500 leading-none">
              🌡 <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
            </p>
          )}
        </div>
      </div>

      {/* Footer: fill bar */}
      {fields.fill_bar && (
        <div className="px-1.5 pb-1 shrink-0">
          <FillBar pct={spool.fill_percentage} hex={hex} />
        </div>
      )}
    </div>
  )
}

// ── 2. Wide Card (50×30mm) ───────────────────────────────────────────────────
// Color stripe left | name + small QR | 2-col data grid (temps, weight) | fill bar
function WideCardLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat   = fp?.material ?? '—'

  return (
    <div className="flex h-full">
      <div className="w-2 shrink-0 rounded-l" style={{ backgroundColor: hex ?? '#6366f1' }} />
      <div className="flex flex-col flex-1 px-2 py-1.5 gap-1 min-w-0">
        {/* Name + QR */}
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            {fields.brand && brand && (
              <p className="text-[7px] text-gray-400 uppercase tracking-wide leading-none truncate">{brand}</p>
            )}
            <p className="text-[11px] font-bold text-gray-900 leading-tight truncate">{name}</p>
          </div>
          <div className="shrink-0">
            <QRCodeSVG value={qrValue(spool, encoding)} size={36} level="M" />
          </div>
        </div>

        {/* 2-col data */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          <p className="text-[8px] text-gray-500 leading-none truncate">
            {mat}{fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
          </p>
          {fields.weight && (
            <p className="text-[8px] text-gray-500 leading-none tabular-nums">
              {spool.remaining_weight.toFixed(0)}g left
            </p>
          )}
          {fields.temps && (fp?.print_temp_min || fp?.print_temp_max) && (
            <p className="text-[8px] text-gray-500 leading-none">
              🌡 <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
            </p>
          )}
          {fields.bed_temps && (fp?.bed_temp_min || fp?.bed_temp_max) && (
            <p className="text-[8px] text-gray-500 leading-none">
              🛏 <TempRange min={fp.bed_temp_min} max={fp.bed_temp_max} />
            </p>
          )}
        </div>

        {fields.fill_bar && <FillBar pct={spool.fill_percentage} hex={hex} />}
      </div>
    </div>
  )
}

// ── 3. Slim Tag (40×24mm) ────────────────────────────────────────────────────
// Compressed Classic Badge — same structure, tighter vertical spacing
function SlimTagLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat   = fp?.material ?? '—'

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-1.5 py-px shrink-0"
        style={{ backgroundColor: hex ?? '#6366f1' }}
      >
        {fields.brand && brand
          ? <span className="text-[7px] font-semibold text-white/90 truncate">{brand}</span>
          : <span />
        }
        <span className="text-[7px] text-white/80 ml-auto shrink-0">
          {mat}{fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
        </span>
      </div>

      <div className="flex flex-1 min-h-0 gap-1 px-1 py-0.5">
        <div className="shrink-0 self-center">
          <QRCodeSVG value={qrValue(spool, encoding)} size={42} level="M" />
        </div>
        <div className="flex flex-col justify-center gap-0.5 min-w-0 flex-1">
          <p className="text-[10px] font-bold text-gray-900 leading-tight truncate">{name}</p>
          {fields.weight && (
            <p className="text-[8px] text-gray-500 leading-none tabular-nums">
              {spool.remaining_weight.toFixed(0)}g
            </p>
          )}
          {fields.temps && (fp?.print_temp_min || fp?.print_temp_max) && (
            <p className="text-[7px] text-gray-500 leading-none">
              🌡 <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
            </p>
          )}
        </div>
      </div>

      {fields.fill_bar && (
        <div className="px-1 pb-0.5 shrink-0">
          <FillBar pct={spool.fill_percentage} hex={hex} compact />
        </div>
      )}
    </div>
  )
}

// ── 4. Micro Strip (40×12mm) ─────────────────────────────────────────────────
// Single horizontal strip: color sliver | tiny QR | name | material | fill bar
function MicroStripLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp   = spool.filament
  const hex  = fp?.color_hex ?? spool.color_hex ?? null
  const name = spool.name ?? fp?.name ?? '—'
  const mat  = fp?.material ?? ''

  return (
    <div className="flex h-full items-center">
      <div className="w-1.5 h-full rounded-l shrink-0" style={{ backgroundColor: hex ?? '#6366f1' }} />
      <div className="px-1 shrink-0">
        <QRCodeSVG value={qrValue(spool, encoding)} size={28} level="L" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <p className="text-[8px] font-bold text-gray-900 truncate leading-none">{name}</p>
        <p className="text-[7px] text-gray-500 truncate leading-none">{mat}</p>
      </div>
      {fields.fill_bar && (
        <div className="w-14 px-1 shrink-0">
          <FillBar pct={spool.fill_percentage} hex={hex} compact />
        </div>
      )}
    </div>
  )
}

// ── 5. Square Classic (40×30mm) ──────────────────────────────────────────────
// Avery-optimized: color stripe left, centered name + QR + fill bar balance
function SquareClassicLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat   = fp?.material ?? '—'

  return (
    <div className="flex h-full">
      <div className="w-2 shrink-0 rounded-l" style={{ backgroundColor: hex ?? '#6366f1' }} />
      <div className="flex flex-col flex-1 items-center justify-between px-1.5 py-1.5 min-w-0">
        <div className="text-center min-w-0 w-full">
          {fields.brand && brand && (
            <p className="text-[7px] text-gray-400 uppercase tracking-wide leading-none">{brand}</p>
          )}
          <p className="text-[11px] font-bold text-gray-900 leading-tight truncate">{name}</p>
          <p className="text-[8px] text-gray-500 leading-none">
            {mat}{fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
          </p>
        </div>

        <QRCodeSVG value={qrValue(spool, encoding)} size={46} level="M" />

        <div className="w-full space-y-0.5">
          {fields.weight && (
            <p className="text-[8px] text-gray-500 leading-none text-center tabular-nums">
              {spool.remaining_weight.toFixed(0)}g / {spool.initial_weight.toFixed(0)}g
            </p>
          )}
          {fields.fill_bar && <FillBar pct={spool.fill_percentage} hex={hex} compact />}
        </div>
      </div>
    </div>
  )
}

// ── 6. Tall Card (30×40mm) ───────────────────────────────────────────────────
// Portrait: color header + spool icon | brand/name | QR centered | data rows | fill bar
function TallCardLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat   = fp?.material ?? '—'

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-center gap-1 px-1.5 py-1 shrink-0"
        style={{ backgroundColor: hex ?? '#6366f1' }}
      >
        <SpoolRingIcon color="#ffffff" size={13} />
        {fields.brand && brand && (
          <span className="text-[7px] font-semibold text-white/90 truncate">{brand}</span>
        )}
      </div>

      <div className="text-center px-1.5 pt-1 shrink-0">
        <p className="text-[10px] font-bold text-gray-900 leading-tight">{name}</p>
        <p className="text-[7px] text-gray-500 leading-none mt-0.5">
          {mat}{fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
        </p>
      </div>

      <div className="flex justify-center py-1.5 flex-1 items-center">
        <QRCodeSVG value={qrValue(spool, encoding)} size={52} level="M" />
      </div>

      <div className="px-1.5 pb-1.5 shrink-0 space-y-0.5">
        {fields.weight && (
          <p className="text-[7px] text-gray-500 leading-none text-center tabular-nums">
            {spool.remaining_weight.toFixed(0)}g / {spool.initial_weight.toFixed(0)}g
          </p>
        )}
        {fields.temps && (fp?.print_temp_min || fp?.print_temp_max) && (
          <p className="text-[7px] text-gray-500 leading-none text-center">
            🌡 <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
          </p>
        )}
        {fields.fill_bar && <FillBar pct={spool.fill_percentage} hex={hex} compact />}
      </div>
    </div>
  )
}

// ── 7. Narrow Portrait (25×40mm) ─────────────────────────────────────────────
// Spool end edge label: thin strip | QR top | name | material | weight | fill bar
function NarrowPortraitLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp   = spool.filament
  const hex  = fp?.color_hex ?? spool.color_hex ?? null
  const name = spool.name ?? fp?.name ?? '—'
  const mat  = fp?.material ?? '—'

  return (
    <div className="flex flex-col h-full">
      <div className="h-2 rounded-t shrink-0" style={{ backgroundColor: hex ?? '#6366f1' }} />

      <div className="flex justify-center pt-1.5 shrink-0">
        <QRCodeSVG value={qrValue(spool, encoding)} size={54} level="M" />
      </div>

      <div className="flex flex-col items-center px-1 pt-1 pb-1 flex-1 gap-0.5 min-h-0">
        <p className="text-[8px] font-bold text-gray-900 leading-tight text-center w-full truncate">{name}</p>
        <p className="text-[7px] text-gray-500 leading-none">{mat}</p>
        {fields.weight && (
          <p className="text-[7px] text-gray-500 leading-none tabular-nums">
            {spool.remaining_weight.toFixed(0)}g
          </p>
        )}
      </div>

      {fields.fill_bar && (
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

export function SpoolLabel({ spool, template, fields, encoding, className = '' }: Props) {
  const { w, h } = LABEL_PX[template]

  return (
    <div
      className={`${className} rounded border border-gray-300 bg-white shadow-sm overflow-hidden select-none`}
      style={{ width: w, height: h }}
    >
      {template === 'classic-badge'   && <ClassicBadgeLabel   spool={spool} fields={fields} encoding={encoding} />}
      {template === 'wide-card'       && <WideCardLabel       spool={spool} fields={fields} encoding={encoding} />}
      {template === 'slim-tag'        && <SlimTagLabel        spool={spool} fields={fields} encoding={encoding} />}
      {template === 'micro-strip'     && <MicroStripLabel     spool={spool} fields={fields} encoding={encoding} />}
      {template === 'square-classic'  && <SquareClassicLabel  spool={spool} fields={fields} encoding={encoding} />}
      {template === 'tall-card'       && <TallCardLabel       spool={spool} fields={fields} encoding={encoding} />}
      {template === 'narrow-portrait' && <NarrowPortraitLabel spool={spool} fields={fields} encoding={encoding} />}
    </div>
  )
}
