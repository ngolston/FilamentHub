import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Printer, Search, CheckSquare, Square, QrCode,
  LayoutGrid, ChevronDown, Info,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { SpoolLabel, DEFAULT_FIELDS } from './SpoolLabel'
import type { LabelTemplate, QrEncoding, LabelFields } from './SpoolLabel'
import type { SpoolResponse } from '@/types/api'

// ── Config types ─────────────────────────────────────────────────────────────

const TEMPLATES: { value: LabelTemplate; label: string; size: string }[] = [
  { value: 'mini',     label: 'Mini',     size: '50 × 30 mm' },
  { value: 'standard', label: 'Standard', size: '70 × 42 mm' },
  { value: 'detailed', label: 'Detailed', size: '90 × 55 mm' },
]

const COLUMNS = [2, 3, 4] as const

const QR_OPTIONS: { value: QrEncoding; label: string; hint: string }[] = [
  { value: 'url',     label: 'App URL',   hint: 'Links back to the spool page in FilamentHub' },
  { value: 'id',      label: 'Spool ID',  hint: 'Short code: FH-123' },
  { value: 'summary', label: 'Summary',   hint: 'Brand · name · material · fill %' },
]

const FIELD_LABELS: { key: keyof LabelFields; label: string; unavailable?: LabelTemplate[] }[] = [
  { key: 'brand',     label: 'Brand name'  },
  { key: 'temps',     label: 'Print temps' },
  { key: 'bed_temps', label: 'Bed temps',  unavailable: ['mini'] },
  { key: 'fill_bar',  label: 'Fill bar'    },
  { key: 'weight',    label: 'Weight'      },
  { key: 'diameter',  label: 'Diameter'    },
  { key: 'lot',       label: 'Lot number', unavailable: ['mini', 'standard'] },
]

// ── Print helper ─────────────────────────────────────────────────────────────

function printLabels(areaId: string, cols: number, template: LabelTemplate) {
  const mmW = { mini: 50, standard: 70, detailed: 90 }[template]
  const mmH = { mini: 30, standard: 42, detailed: 55 }[template]
  const gapMm = 3

  const style = document.createElement('style')
  style.id    = '__qr_print__'
  style.textContent = `
    @media print {
      @page { margin: 10mm; }
      body > * { display: none !important; }
      #${areaId} {
        display: grid !important;
        grid-template-columns: repeat(${cols}, ${mmW}mm);
        gap: ${gapMm}mm;
        width: fit-content;
      }
      #${areaId} > * {
        width: ${mmW}mm !important;
        height: ${mmH}mm !important;
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

// ── Spool picker ─────────────────────────────────────────────────────────────

function SpoolPickerRow({
  spool,
  selected,
  onToggle,
}: {
  spool: SpoolResponse
  selected: boolean
  onToggle: () => void
}) {
  const fp  = spool.filament
  const hex = fp?.color_hex
  const name = spool.name ?? fp?.name ?? '—'
  const sub  = [fp?.brand?.name ?? spool.brand?.name, fp?.material].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
        ${selected ? 'bg-primary-600/15' : 'hover:bg-surface-2'}`}
    >
      {selected
        ? <CheckSquare className="h-4 w-4 shrink-0 text-primary-400" />
        : <Square      className="h-4 w-4 shrink-0 text-gray-600" />}
      <div
        className="h-4 w-4 shrink-0 rounded-sm border border-white/10"
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
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [template, setTemplate] = useState<LabelTemplate>('standard')
  const [columns,  setColumns]  = useState<2 | 3 | 4>(3)
  const [encoding, setEncoding] = useState<QrEncoding>('url')
  const [fields,   setFields]   = useState<LabelFields>(DEFAULT_FIELDS)
  const [showFieldCfg, setShowFieldCfg] = useState(false)

  // Load all spools (up to 200 — personal inventory)
  const { data, isLoading } = useQuery({
    queryKey: ['spools', 'all'],
    queryFn: () => spoolsApi.list({ page_size: 200 }),
  })

  const allSpools  = data?.items ?? []
  const filtered   = allSpools.filter((s) => {
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

  function selectAll()   { setSelected(new Set(filtered.map((s) => s.id))) }
  function selectNone()  { setSelected(new Set()) }

  function toggleField(key: keyof LabelFields, val: boolean) {
    setFields((f) => ({ ...f, [key]: val }))
  }

  const colClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[columns]

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Left: spool picker ────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-surface-border bg-surface-1">
        <div className="p-3 border-b border-surface-border space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Spools
            </p>
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
            <div className="flex items-center justify-center py-10 text-gray-500">
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
      </aside>

      {/* ── Right: config + preview ──────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-wrap items-start gap-4 px-5 py-4 border-b border-surface-border bg-surface-1 shrink-0">

          {/* Template */}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">Template</p>
            <div className="flex gap-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTemplate(t.value)}
                  title={t.size}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                    ${template === t.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-2 text-gray-400 hover:text-white border border-surface-border'
                    }`}
                >
                  {t.label}
                  <span className="ml-1 text-[10px] opacity-60">{t.size}</span>
                </button>
              ))}
            </div>
          </div>

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

          {/* Print button — right-aligned */}
          <div className="ml-auto flex items-end">
            <Button
              onClick={() => printLabels(PRINT_AREA_ID, columns, template)}
              disabled={selectedSpools.length === 0}
            >
              <Printer className="h-4 w-4" />
              Print {selectedSpools.length > 0 ? `${selectedSpools.length} label${selectedSpools.length !== 1 ? 's' : ''}` : 'labels'}
            </Button>
          </div>
        </div>

        {/* Field config popdown */}
        {showFieldCfg && (
          <div className="px-5 py-3 border-b border-surface-border bg-surface-2 flex flex-wrap gap-x-5 gap-y-2 shrink-0">
            {FIELD_LABELS.map(({ key, label, unavailable }) => {
              const disabled = unavailable?.includes(template) ?? false
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
                    <span className="text-[10px] text-gray-500">(n/a for {template})</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto p-5 bg-surface">
          {selectedSpools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
              <QrCode className="h-12 w-12" />
              <p className="text-sm">Select spools on the left to preview labels</p>
            </div>
          ) : (
            <>
              {/* Screen preview */}
              <div className={`grid ${colClass} gap-4`}>
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

              {/* Print-only area (hidden on screen, shown when printing) */}
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
                Labels print at actual physical size ({TEMPLATES.find(t => t.value === template)?.size}).
                Set your printer to no scaling / 100%.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
