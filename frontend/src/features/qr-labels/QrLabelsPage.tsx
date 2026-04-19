import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Printer, CheckSquare, Square, QrCode,
  LayoutGrid, ChevronDown, Info,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { SpoolLabel, LABEL_PX, DEFAULT_FIELDS } from './SpoolLabel'
import type { LabelTemplate, QrEncoding, LabelFields } from './SpoolLabel'
import type { SpoolResponse } from '@/types/api'

// ── Template registry ─────────────────────────────────────────────────────────

interface TemplateEntry {
  value: LabelTemplate
  label: string
  size:  string
  mmW:   number
  mmH:   number
}

const TEMPLATES: TemplateEntry[] = [
  { value: 'classic-badge',   label: 'Classic Badge',   size: '40 × 30 mm', mmW: 40, mmH: 30 },
  { value: 'wide-card',       label: 'Wide Card',       size: '50 × 30 mm', mmW: 50, mmH: 30 },
  { value: 'slim-tag',        label: 'Slim Tag',        size: '40 × 24 mm', mmW: 40, mmH: 24 },
  { value: 'micro-strip',     label: 'Micro Strip',     size: '40 × 12 mm', mmW: 40, mmH: 12 },
  { value: 'square-classic',  label: 'Square Classic',  size: '40 × 30 mm', mmW: 40, mmH: 30 },
  { value: 'tall-card',       label: 'Tall Card',       size: '30 × 40 mm', mmW: 30, mmH: 40 },
  { value: 'narrow-portrait', label: 'Narrow Portrait', size: '25 × 40 mm', mmW: 25, mmH: 40 },
]

const COLUMNS = [2, 3, 4] as const

const QR_OPTIONS: { value: QrEncoding; label: string; hint: string }[] = [
  { value: 'url',     label: 'App URL',  hint: 'Links back to the spool page in FilamentHub' },
  { value: 'id',      label: 'Spool ID', hint: 'Short code: FH-123' },
  { value: 'summary', label: 'Summary',  hint: 'Brand · name · material · fill %' },
]

// Templates that support bed temps / lot number in their layout
const BEDS_SUPPORTED: LabelTemplate[] = ['wide-card']

const FIELD_LABELS: { key: keyof LabelFields; label: string; unavailableFor?: (t: LabelTemplate) => boolean }[] = [
  { key: 'brand',     label: 'Brand name'  },
  { key: 'temps',     label: 'Print temps', unavailableFor: (t) => t === 'micro-strip' },
  { key: 'bed_temps', label: 'Bed temps',   unavailableFor: (t) => !BEDS_SUPPORTED.includes(t) },
  { key: 'fill_bar',  label: 'Fill bar'    },
  { key: 'weight',    label: 'Weight',      unavailableFor: (t) => t === 'micro-strip' },
  { key: 'diameter',  label: 'Diameter',   unavailableFor: (t) => t === 'micro-strip' || t === 'narrow-portrait' },
  { key: 'lot',       label: 'Lot number', unavailableFor: () => true },
]

// ── Template thumbnail ────────────────────────────────────────────────────────

function TemplateThumbnail({ value, active }: { value: LabelTemplate; active: boolean }) {
  const cls = {
    wrap:   active ? 'bg-primary-900/50 border-primary-600/60' : 'bg-white/5 border-white/10',
    stripe: active ? 'bg-primary-400'         : 'bg-gray-500',
    qr:     active ? 'bg-primary-700/60'      : 'bg-gray-600/40',
    line:   active ? 'bg-primary-300/50'      : 'bg-gray-400/35',
    dim:    active ? 'bg-primary-300/30'      : 'bg-gray-500/25',
    bar:    active ? 'bg-primary-400/60'      : 'bg-gray-400/40',
  }

  const base = `rounded border overflow-hidden ${cls.wrap}`

  switch (value) {
    case 'classic-badge': return (
      <div className={`${base} w-14 h-[42px] flex flex-col`}>
        <div className={`h-2.5 w-full ${cls.stripe}`} />
        <div className="flex flex-1 gap-1 p-1">
          <div className={`w-[18px] h-[18px] rounded-sm shrink-0 ${cls.qr}`} />
          <div className="flex flex-col gap-0.5 flex-1">
            <div className={`h-1.5 w-full rounded-sm ${cls.line}`} />
            <div className={`h-1 w-3/4 rounded-sm ${cls.dim}`} />
          </div>
        </div>
        <div className={`h-1.5 mx-1 mb-1 rounded-full ${cls.bar}`} />
      </div>
    )
    case 'wide-card': return (
      <div className={`${base} w-14 h-[34px] flex`}>
        <div className={`w-1.5 h-full ${cls.stripe}`} />
        <div className="flex flex-col flex-1 p-1 gap-0.5">
          <div className="flex gap-1 items-start">
            <div className="flex-1 space-y-0.5">
              <div className={`h-1.5 w-full rounded-sm ${cls.line}`} />
              <div className={`h-1 w-2/3 rounded-sm ${cls.dim}`} />
            </div>
            <div className={`w-[14px] h-[14px] rounded-sm shrink-0 ${cls.qr}`} />
          </div>
          <div className={`h-1 mx-0 rounded-full ${cls.bar}`} />
        </div>
      </div>
    )
    case 'slim-tag': return (
      <div className={`${base} w-14 h-[34px] flex flex-col`}>
        <div className={`h-2 w-full ${cls.stripe}`} />
        <div className="flex flex-1 gap-1 px-1 py-0.5">
          <div className={`w-[15px] h-[15px] rounded-sm shrink-0 ${cls.qr}`} />
          <div className="flex flex-col gap-0.5 flex-1">
            <div className={`h-1.5 w-full rounded-sm ${cls.line}`} />
            <div className={`h-1 w-1/2 rounded-sm ${cls.dim}`} />
          </div>
        </div>
        <div className={`h-1 mx-1 mb-0.5 rounded-full ${cls.bar}`} />
      </div>
    )
    case 'micro-strip': return (
      <div className={`${base} w-14 h-[17px] flex items-center`}>
        <div className={`w-1 h-full ${cls.stripe}`} />
        <div className={`w-[12px] h-[12px] rounded-sm mx-0.5 shrink-0 ${cls.qr}`} />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className={`h-1 w-full rounded-sm ${cls.line}`} />
          <div className={`h-0.5 w-2/3 rounded-sm ${cls.dim}`} />
        </div>
        <div className={`w-5 h-1 mx-0.5 rounded-full shrink-0 ${cls.bar}`} />
      </div>
    )
    case 'square-classic': return (
      <div className={`${base} w-14 h-[42px] flex`}>
        <div className={`w-1.5 h-full ${cls.stripe}`} />
        <div className="flex flex-col flex-1 items-center justify-between py-1 px-1">
          <div className={`h-1.5 w-3/4 rounded-sm ${cls.line}`} />
          <div className={`w-[18px] h-[18px] rounded-sm ${cls.qr}`} />
          <div className={`h-1 w-3/4 rounded-full ${cls.bar}`} />
        </div>
      </div>
    )
    case 'tall-card': return (
      <div className={`${base} w-10 h-14 flex flex-col`}>
        <div className={`h-2.5 w-full ${cls.stripe}`} />
        <div className="flex-1 flex flex-col items-center justify-between py-1 px-1">
          <div className={`h-1.5 w-3/4 rounded-sm ${cls.line}`} />
          <div className={`w-[18px] h-[18px] rounded-sm ${cls.qr}`} />
          <div className="w-full space-y-0.5">
            <div className={`h-1 w-full rounded-sm ${cls.dim}`} />
            <div className={`h-1 w-full rounded-full ${cls.bar}`} />
          </div>
        </div>
      </div>
    )
    case 'narrow-portrait': return (
      <div className={`${base} w-8 h-14 flex flex-col`}>
        <div className={`h-1.5 w-full ${cls.stripe}`} />
        <div className="flex-1 flex flex-col items-center justify-between py-1 px-0.5">
          <div className={`w-[18px] h-[18px] rounded-sm ${cls.qr}`} />
          <div className="w-full space-y-0.5">
            <div className={`h-1 w-full rounded-sm ${cls.line}`} />
            <div className={`h-1 w-2/3 mx-auto rounded-sm ${cls.dim}`} />
            <div className={`h-1 w-full rounded-full ${cls.bar}`} />
          </div>
        </div>
      </div>
    )
    default: return null
  }
}

// ── Print helper ─────────────────────────────────────────────────────────────

function printLabels(areaId: string, cols: number, template: LabelTemplate) {
  const t = TEMPLATES.find((x) => x.value === template)!
  const gapMm = 3

  const style = document.createElement('style')
  style.id    = '__qr_print__'
  style.textContent = `
    @media print {
      @page { margin: 10mm; }
      body > * { display: none !important; }
      #${areaId} {
        display: grid !important;
        grid-template-columns: repeat(${cols}, ${t.mmW}mm);
        gap: ${gapMm}mm;
        width: fit-content;
      }
      #${areaId} > * {
        width:  ${t.mmW}mm !important;
        height: ${t.mmH}mm !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  `
  document.head.appendChild(style)
  const afterPrint = () => {
    document.head.removeChild(style)
    window.removeEventListener('afterprint', afterPrint)
  }
  window.addEventListener('afterprint', afterPrint)
  window.print()
}

// ── Spool picker row ──────────────────────────────────────────────────────────

function SpoolPickerRow({
  spool, selected, onToggle,
}: { spool: SpoolResponse; selected: boolean; onToggle: () => void }) {
  const fp   = spool.filament
  const hex  = fp?.color_hex
  const name = spool.name ?? fp?.name ?? '—'
  const sub  = [fp?.brand?.name ?? spool.brand?.name, fp?.material].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
        ${selected ? 'bg-primary-600/15' : 'hover:bg-surface-2'}`}
    >
      {selected
        ? <CheckSquare className="h-4 w-4 shrink-0 text-primary-400" />
        : <Square      className="h-4 w-4 shrink-0 text-gray-600" />}
      <div
        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-white/10"
        style={{ backgroundColor: hex ?? '#374151' }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate leading-tight">{name}</p>
        {sub && <p className="text-xs text-gray-500 truncate leading-none">{sub}</p>}
      </div>
      <span className="text-xs text-gray-600 tabular-nums shrink-0">
        {spool.fill_percentage.toFixed(0)}%
      </span>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PRINT_AREA_ID = 'qr-label-print-area'

export default function QrLabelsPage() {
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [template,     setTemplate]     = useState<LabelTemplate>('classic-badge')
  const [columns,      setColumns]      = useState<2 | 3 | 4>(3)
  const [encoding,     setEncoding]     = useState<QrEncoding>('url')
  const [fields,       setFields]       = useState<LabelFields>(DEFAULT_FIELDS)
  const [showFieldCfg, setShowFieldCfg] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['spools', 'all'],
    queryFn: () => spoolsApi.list({ page_size: 200 }),
  })

  const allSpools = data?.items ?? []
  const filtered  = allSpools.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (s.name ?? s.filament?.name ?? '').toLowerCase().includes(q) ||
      (s.filament?.material ?? '').toLowerCase().includes(q) ||
      (s.filament?.brand?.name ?? s.brand?.name ?? '').toLowerCase().includes(q)
    )
  })

  const selectedSpools = allSpools.filter((s) => selected.has(s.id))

  function toggleSpool(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll()  { setSelected(new Set(filtered.map((s) => s.id))) }
  function selectNone() { setSelected(new Set()) }

  function toggleField(key: keyof LabelFields, val: boolean) {
    setFields((f) => ({ ...f, [key]: val }))
  }

  const colClass = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns]
  const activeEntry = TEMPLATES.find((t) => t.value === template)!

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Left panel: templates + spools ──────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-surface-border bg-surface-1">

        {/* Templates section */}
        <div className="shrink-0">
          <div className="px-3 pt-3 pb-2 border-b border-surface-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Templates</p>
          </div>
          <div className="divide-y divide-surface-border">
            {TEMPLATES.map((t) => {
              const active = t.value === template
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTemplate(t.value)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                    ${active ? 'bg-primary-600/15' : 'hover:bg-surface-2'}`}
                >
                  <TemplateThumbnail value={t.value} active={active} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium leading-tight ${active ? 'text-primary-300' : 'text-white'}`}>
                      {t.label}
                    </p>
                    <p className="text-[11px] text-gray-500 leading-none mt-0.5">{t.size}</p>
                  </div>
                  {active && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Spools section */}
        <div className="flex flex-col flex-1 min-h-0 border-t border-surface-border">
          <div className="p-3 border-b border-surface-border space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Spools</p>
              <div className="flex gap-2 text-xs text-primary-400">
                <button onClick={selectAll}  className="hover:text-primary-300">All</button>
                <span className="text-gray-600">·</span>
                <button onClick={selectNone} className="hover:text-primary-300">None</button>
              </div>
            </div>
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {selected.size > 0 && (
              <p className="text-xs text-primary-400">{selected.size} selected</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-gray-300" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-500">No spools found</p>
            ) : (
              filtered.map((spool) => (
                <SpoolPickerRow
                  key={spool.id}
                  spool={spool}
                  selected={selected.has(spool.id)}
                  onToggle={() => toggleSpool(spool.id)}
                />
              ))
            )}
          </div>
        </div>
      </aside>

      {/* ── Right: toolbar + preview ─────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-wrap items-start gap-4 px-5 py-4 border-b border-surface-border bg-surface-1 shrink-0">

          {/* Columns */}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">Columns</p>
            <div className="flex gap-1">
              {COLUMNS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColumns(c)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                    ${columns === c
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-2 text-gray-400 hover:text-white border border-surface-border'
                    }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* QR content */}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">QR encodes</p>
            <div className="flex gap-1">
              {QR_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setEncoding(o.value)}
                  title={o.hint}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                    ${encoding === o.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-2 text-gray-400 hover:text-white border border-surface-border'
                    }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Field toggles */}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">Fields</p>
            <button
              onClick={() => setShowFieldCfg((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-surface-2 text-gray-400 hover:text-white border border-surface-border"
            >
              <LayoutGrid className="h-3 w-3" />
              Configure
              <ChevronDown className={`h-3 w-3 transition-transform ${showFieldCfg ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Print button */}
          <div className="ml-auto flex items-end">
            <Button
              onClick={() => printLabels(PRINT_AREA_ID, columns, template)}
              disabled={selectedSpools.length === 0}
            >
              <Printer className="h-4 w-4" />
              Print {selectedSpools.length > 0
                ? `${selectedSpools.length} label${selectedSpools.length !== 1 ? 's' : ''}`
                : 'labels'}
            </Button>
          </div>
        </div>

        {/* Field config popdown */}
        {showFieldCfg && (
          <div className="px-5 py-3 border-b border-surface-border bg-surface-2 flex flex-wrap gap-x-5 gap-y-2 shrink-0">
            {FIELD_LABELS.map(({ key, label, unavailableFor }) => {
              const disabled = unavailableFor?.(template) ?? false
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Toggle
                    checked={!disabled && fields[key]}
                    onChange={(v) => !disabled && toggleField(key, v)}
                    disabled={disabled}
                  />
                  <span className="text-gray-300">{label}</span>
                  {disabled && (
                    <span className="text-[10px] text-gray-500">(n/a)</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-5 bg-surface">
          {selectedSpools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
              <QrCode className="h-12 w-12" />
              <p className="text-sm">Select spools on the left to preview labels</p>
            </div>
          ) : (
            <>
              <div className={`grid ${colClass} gap-4 items-start`}>
                {selectedSpools.map((spool) => (
                  <SpoolLabel
                    key={spool.id}
                    spool={spool}
                    template={template}
                    fields={fields}
                    encoding={encoding}
                  />
                ))}
              </div>

              {/* Print-only area */}
              <div id={PRINT_AREA_ID} style={{ display: 'none' }}>
                {selectedSpools.map((spool) => (
                  <SpoolLabel
                    key={spool.id}
                    spool={spool}
                    template={template}
                    fields={fields}
                    encoding={encoding}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5 mt-4 text-xs text-gray-600">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Labels print at actual size ({activeEntry.size}). Set your printer to no scaling / 100%.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
