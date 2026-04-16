import { QRCodeSVG } from 'qrcode.react'
import type { SpoolResponse } from '@/types/api'

export type LabelTemplate = 'mini' | 'standard' | 'detailed'
export type QrEncoding   = 'url' | 'id' | 'summary'

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
  /** extra className for the root element (e.g. print sizing) */
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

function FillBar({ pct, hex }: { pct: number; hex: string | null }) {
  const bg = hex ?? '#6366f1'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: bg }}
        />
      </div>
      <span className="text-[10px] font-semibold tabular-nums text-gray-600 w-8 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

// ── Mini label (≈50 × 30 mm) ─────────────────────────────────────────────────
function MiniLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp   = spool.filament
  const hex  = fp?.color_hex ?? null
  const name = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat  = fp?.material ?? '—'

  return (
    <div className="flex h-full">
      {/* Color stripe */}
      <div className="w-2 rounded-l shrink-0" style={{ backgroundColor: hex ?? '#6366f1' }} />

      <div className="flex flex-1 items-center gap-2 px-2 py-1.5">
        {/* QR */}
        <div className="shrink-0">
          <QRCodeSVG value={qrValue(spool, encoding)} size={44} level="M" />
        </div>

        {/* Text */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {fields.brand && brand && (
            <p className="text-[9px] text-gray-500 truncate leading-none">{brand}</p>
          )}
          <p className="text-[11px] font-bold text-gray-900 truncate leading-tight">{name}</p>
          <p className="text-[9px] text-gray-600 leading-none">
            {mat}{fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
          </p>
          {fields.fill_bar && (
            <FillBar pct={spool.fill_percentage} hex={hex} />
          )}
          {fields.weight && (
            <p className="text-[9px] text-gray-500 leading-none">
              {spool.remaining_weight.toFixed(0)} g left
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Standard label (≈70 × 42 mm) ─────────────────────────────────────────────
function StandardLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat   = fp?.material ?? '—'

  return (
    <div className="flex h-full">
      {/* Color stripe */}
      <div className="w-2.5 rounded-l shrink-0" style={{ backgroundColor: hex ?? '#6366f1' }} />

      <div className="flex flex-1 gap-2 px-2.5 py-2">
        {/* Text block */}
        <div className="flex flex-col justify-between flex-1 min-w-0 gap-1">
          <div>
            {fields.brand && brand && (
              <p className="text-[9px] text-gray-500 uppercase tracking-wide leading-none mb-0.5">{brand}</p>
            )}
            <p className="text-[12px] font-bold text-gray-900 leading-tight truncate">{name}</p>
            <p className="text-[9px] text-gray-500 leading-none mt-0.5">
              {mat}
              {fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
            </p>
          </div>

          {fields.temps && (fp?.print_temp_min || fp?.print_temp_max) && (
            <p className="text-[9px] text-gray-600 leading-none">
              🌡 <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
            </p>
          )}

          {fields.fill_bar && (
            <FillBar pct={spool.fill_percentage} hex={hex} />
          )}

          {fields.weight && (
            <p className="text-[9px] text-gray-500 leading-none">
              {spool.remaining_weight.toFixed(0)} g / {spool.initial_weight.toFixed(0)} g
            </p>
          )}
        </div>

        {/* QR */}
        <div className="shrink-0 flex items-center">
          <QRCodeSVG value={qrValue(spool, encoding)} size={52} level="M" />
        </div>
      </div>
    </div>
  )
}

// ── Detailed label (≈90 × 55 mm) ─────────────────────────────────────────────
function DetailedLabel({ spool, fields, encoding }: Omit<Props, 'template' | 'className'>) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? '—'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat   = fp?.material ?? '—'

  return (
    <div className="flex h-full">
      {/* Color stripe */}
      <div className="w-3 rounded-l shrink-0" style={{ backgroundColor: hex ?? '#6366f1' }} />

      <div className="flex flex-col flex-1 px-3 py-2 gap-1.5">
        {/* Top: name + QR side by side */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            {fields.brand && brand && (
              <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none">{brand}</p>
            )}
            <p className="text-[13px] font-bold text-gray-900 leading-tight">{name}</p>
            <p className="text-[9px] text-gray-500 leading-none">
              {mat}
              {fields.diameter && fp?.diameter ? ` · ${fp.diameter}mm` : ''}
            </p>
          </div>
          <div className="shrink-0">
            <QRCodeSVG value={qrValue(spool, encoding)} size={64} level="M" />
          </div>
        </div>

        {/* Temps row */}
        {(fields.temps || fields.bed_temps) && (
          <div className="flex gap-3">
            {fields.temps && (fp?.print_temp_min || fp?.print_temp_max) && (
              <p className="text-[9px] text-gray-600">
                🌡 <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
              </p>
            )}
            {fields.bed_temps && (fp?.bed_temp_min || fp?.bed_temp_max) && (
              <p className="text-[9px] text-gray-600">
                🛏 <TempRange min={fp.bed_temp_min} max={fp.bed_temp_max} />
              </p>
            )}
            {fp?.drying_temp && (
              <p className="text-[9px] text-gray-600">
                💨 {fp.drying_temp}°C{fp.drying_duration ? `/${fp.drying_duration}h` : ''}
              </p>
            )}
          </div>
        )}

        {/* Fill bar */}
        {fields.fill_bar && <FillBar pct={spool.fill_percentage} hex={hex} />}

        {/* Weight + lot */}
        <div className="flex items-center justify-between gap-2">
          {fields.weight && (
            <p className="text-[9px] text-gray-500">
              {spool.remaining_weight.toFixed(0)} g remaining · {spool.initial_weight.toFixed(0)} g spool
            </p>
          )}
          {fields.lot && spool.lot_nr && (
            <p className="text-[9px] text-gray-400 font-mono shrink-0">#{spool.lot_nr}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function SpoolLabel({ spool, template, fields, encoding, className = '' }: Props) {
  const sizeClass = {
    mini:     'w-[189px] h-[113px]',   // ~50×30mm at 96dpi
    standard: 'w-[265px] h-[159px]',   // ~70×42mm at 96dpi
    detailed: 'w-[340px] h-[208px]',   // ~90×55mm at 96dpi
  }[template]

  return (
    <div
      className={`${sizeClass} ${className} rounded border border-gray-300 bg-white shadow-sm overflow-hidden select-none`}
    >
      {template === 'mini'     && <MiniLabel     spool={spool} fields={fields} encoding={encoding} />}
      {template === 'standard' && <StandardLabel spool={spool} fields={fields} encoding={encoding} />}
      {template === 'detailed' && <DetailedLabel spool={spool} fields={fields} encoding={encoding} />}
    </div>
  )
}
