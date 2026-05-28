import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import {
  Printer, CheckSquare, Square, QrCode,
  LayoutGrid, ChevronDown, Info, MapPin,
  FileImage, FileDown, X,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { locationsApi } from '@/api/locations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { SpoolLabel, LABEL_PX, CLASSIC_FIELD_OPTIONS, CLASSIC_FIELD_LABELS, TEMPLATE_DEFAULT_SLOTS } from './SpoolLabel'
import type { LabelTemplate, QrEncoding, ClassicSlot, ClassicFieldOption } from './SpoolLabel'
import type { SpoolResponse, LocationResponse } from '@/types/api'

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
  { value: 'url',     label: 'App URL',  hint: 'Links to the public spool page (no login required)' },
  { value: 'id',      label: 'Spool ID', hint: 'Short code: FH-123' },
  { value: 'summary', label: 'Summary',  hint: 'Brand · name · material · fill %' },
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

// ── PDF print helpers ─────────────────────────────────────────────────────────

function printLabels(areaId: string, cols: number, mmW: number, mmH: number) {
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
        width:  ${mmW}mm !important;
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

function printLocationLabels(areaId: string) {
  const mmW = 40, mmH = 30
  const style = document.createElement('style')
  style.id    = '__qr_print_loc__'
  style.textContent = `
    @media print {
      @page { margin: 10mm; }
      body > * { display: none !important; }
      #${areaId} {
        display: grid !important;
        grid-template-columns: repeat(4, ${mmW}mm);
        gap: 3mm;
        width: fit-content;
      }
      #${areaId} > * {
        width:  ${mmW}mm !important;
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

// ── PNG / ZIP export helpers ──────────────────────────────────────────────────

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href     = href
  a.download = filename
  a.click()
}

async function captureElementPng(el: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image')
  return toPng(el, { pixelRatio: 3 })
}

async function downloadSinglePng(el: HTMLElement, filename: string) {
  const dataUrl = await captureElementPng(el)
  triggerDownload(dataUrl, filename)
}

async function downloadZip(
  elements: HTMLElement[],
  filenames: string[],
  zipName: string,
) {
  const JSZip  = (await import('jszip')).default
  const zip    = new JSZip()
  for (let i = 0; i < elements.length; i++) {
    const dataUrl = await captureElementPng(elements[i])
    zip.file(filenames[i], dataUrl.split(',')[1], { base64: true })
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url  = URL.createObjectURL(blob)
  triggerDownload(url, zipName)
  URL.revokeObjectURL(url)
}

// ── Export menu button ────────────────────────────────────────────────────────

interface ExportMenuProps {
  count: number
  disabled: boolean
  exporting: boolean
  onPdf: () => void
  onPng: () => void
}

function ExportMenuButton({ count, disabled, exporting, onPdf, onPng }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  // Close on outside click
  useState(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  })

  const label = count > 0
    ? `${count} label${count !== 1 ? 's' : ''}`
    : 'labels'

  return (
    <div ref={ref} className="relative flex items-end">
      {/* Main button — PDF */}
      <button
        onClick={() => { setOpen(false); onPdf() }}
        disabled={disabled || exporting}
        className="flex items-center gap-1.5 rounded-l-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Printer className="h-4 w-4" />
        Print {label}
      </button>

      {/* Arrow to open dropdown */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || exporting}
        className="flex items-center justify-center rounded-r-lg border-l border-primary-500 bg-primary-600 px-2 py-1.5 text-white hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="More export options"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">
          <button
            onClick={() => { setOpen(false); onPdf() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors text-left"
          >
            <Printer className="h-4 w-4 shrink-0 text-gray-500" />
            <span>
              <span className="font-medium text-white block leading-tight">Print / PDF</span>
              <span className="text-xs text-gray-500">Opens browser print dialog</span>
            </span>
          </button>

          <div className="h-px bg-surface-border" />

          <button
            onClick={() => { setOpen(false); onPng() }}
            disabled={exporting}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors text-left disabled:opacity-50"
          >
            {count > 1
              ? <FileDown className="h-4 w-4 shrink-0 text-gray-500" />
              : <FileImage className="h-4 w-4 shrink-0 text-gray-500" />
            }
            <span>
              <span className="font-medium text-white block leading-tight">
                {count > 1 ? `Save as ZIP (${count} PNGs)` : 'Save as PNG'}
              </span>
              <span className="text-xs text-gray-500">
                {count > 1 ? 'Each label saved as 1.png, 2.png, …' : 'High-resolution image file'}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Exporting overlay indicator */}
      {exporting && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary-900/80 pointer-events-none">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
    </div>
  )
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

// ── Location badge label — 40 × 30 mm ────────────────────────────────────────

const LOC_W = 151
const LOC_H = 113
const LOC_QR = 56

function LocationBadgeLabel({ location, forScreen = false }: { location: LocationResponse; forScreen?: boolean }) {
  const url = `${window.location.origin}/l/${location.id}`

  return (
    <div style={{
      width: LOC_W, height: LOC_H,
      background: '#fff',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      border: '1px solid #000',
      ...(forScreen ? { borderRadius: 6, boxShadow: '0 2px 10px rgba(0,0,0,0.20)' } : {}),
    }}>
      <div style={{
        height: 19, background: '#000', flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 7px', gap: 4, boxSizing: 'border-box',
      }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
          stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span style={{
          color: '#fff', fontSize: 6.5, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase', flex: 1,
        }}>
          Storage Location
        </span>
        <span style={{ color: 'rgba(255,255,255,0.32)', fontSize: 6, letterSpacing: '0.06em', fontWeight: 600 }}>
          FH
        </span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '5px 6px 5px 7px', gap: 4,
          overflow: 'hidden', boxSizing: 'border-box',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 900, color: '#000',
            lineHeight: 1.1, letterSpacing: '-0.01em',
            display: '-webkit-box', overflow: 'hidden',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          } as React.CSSProperties}>
            {location.name}
          </div>
          <div style={{ height: 1, background: '#d1d5db' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 4, height: 4, borderRadius: 1, background: '#000', flexShrink: 0 }} />
            <span style={{ fontSize: 7.5, color: '#374151', fontWeight: 500 }}>
              {location.spool_count} spool{location.spool_count !== 1 ? 's' : ''}
            </span>
          </div>
          {location.is_dry_box && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              border: '1px solid #000', borderRadius: 2, padding: '1.5px 3px',
              fontSize: 6, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#000', width: 'fit-content',
            }}>
              <svg width="6" height="6" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6l9-4 9 4v12l-9 4-9-4V6z"/>
                <path d="M3 6l9 4 9-4"/>
                <path d="M12 22V10"/>
              </svg>
              Dry Box
            </div>
          )}
          {location.description && (
            <div style={{
              fontSize: 6.5, color: '#6b7280',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', lineHeight: 1.3,
            }}>
              {location.description}
            </div>
          )}
        </div>
        <div style={{ width: 1, background: '#e5e7eb', flexShrink: 0 }} />
        <div style={{
          width: 66, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 5, flexShrink: 0, boxSizing: 'border-box',
        }}>
          <QRCodeSVG value={url} size={LOC_QR} level="M" bgColor="#ffffff" fgColor="#000000" />
        </div>
      </div>

      <div style={{
        height: 13, background: '#111', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', flex: 1, marginLeft: 8 }} />
        <span style={{
          color: 'rgba(255,255,255,0.60)', fontSize: 6.5,
          fontFamily: 'monospace', letterSpacing: '0.12em', fontWeight: 600, whiteSpace: 'nowrap',
        }}>
          LOC-{location.id}
        </span>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', flex: 1, marginRight: 8 }} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PRINT_AREA_ID     = 'qr-label-print-area'
const LOC_PRINT_AREA_ID = 'qr-label-loc-print-area'
const EXPORT_AREA_ID    = 'qr-label-export-area'

type Tab = 'spools' | 'locations'

export default function QrLabelsPage() {
  const [tab,          setTab]          = useState<Tab>('spools')
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [template,     setTemplate]     = useState<LabelTemplate>('classic-badge')
  const [columns,      setColumns]      = useState<2 | 3 | 4>(3)
  const [encoding,     setEncoding]     = useState<QrEncoding>('url')
  const [showFieldCfg,  setShowFieldCfg]  = useState(false)
  const [previewScale,  setPreviewScale]  = useState(2)
  const [templateSlots, setTemplateSlots] = useState<Partial<Record<LabelTemplate, ClassicSlot[]>>>({})
  const [locSelected,   setLocSelected]  = useState<Set<number>>(new Set())

  // Export state — controls whether the off-screen export area is mounted
  const [exportMode,    setExportMode]   = useState<'idle' | 'spools' | 'locations'>('idle')
  const [exporting,     setExporting]    = useState(false)
  const exportAreaRef = useRef<HTMLDivElement>(null)

  const { data: spoolData, isLoading: spoolsLoading } = useQuery({
    queryKey: ['spools', 'all'],
    queryFn: () => spoolsApi.list({ page_size: 200 }),
  })

  const { data: locations = [], isLoading: locsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list(),
  })

  const allSpools      = spoolData?.items ?? []
  const filtered       = allSpools.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (s.name ?? s.filament?.name ?? '').toLowerCase().includes(q) ||
      (s.filament?.material ?? '').toLowerCase().includes(q) ||
      (s.filament?.brand?.name ?? s.brand?.name ?? '').toLowerCase().includes(q)
    )
  })

  const selectedSpools    = allSpools.filter((s) => selected.has(s.id))
  const selectedLocations = locations.filter((l) => locSelected.has(l.id))

  function toggleSpool(id: number) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function selectAll()  { setSelected(new Set(filtered.map((s) => s.id))) }
  function selectNone() { setSelected(new Set()) }

  function toggleLocation(id: number) {
    setLocSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function selectAllLocs()  { setLocSelected(new Set(locations.map((l) => l.id))) }
  function selectNoneLocs() { setLocSelected(new Set()) }

  const currentSlots = templateSlots[template] ?? TEMPLATE_DEFAULT_SLOTS[template]
  function updateSlots(newSlots: ClassicSlot[]) {
    setTemplateSlots((prev) => ({ ...prev, [template]: newSlots }))
  }
  function resetSlots() {
    setTemplateSlots((prev) => { const next = { ...prev }; delete next[template]; return next })
  }

  const activeEntry = TEMPLATES.find((t) => t.value === template)!

  // ── PNG export ──────────────────────────────────────────────────────────────

  const handleSpoolPng = useCallback(async () => {
    setExporting(true)
    setExportMode('spools')

    // Wait two frames for the portal to render
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    const container = exportAreaRef.current
    if (!container) { setExporting(false); setExportMode('idle'); return }

    const els = Array.from(container.children) as HTMLElement[]

    try {
      if (els.length === 1) {
        const spool = selectedSpools[0]
        await downloadSinglePng(els[0], `spool-${spool.id}.png`)
      } else {
        const filenames = selectedSpools.map((_, i) => `${i + 1}.png`)
        await downloadZip(els, filenames, 'spool-labels.zip')
      }
    } finally {
      setExporting(false)
      setExportMode('idle')
    }
  }, [selectedSpools])

  const handleLocationPng = useCallback(async () => {
    setExporting(true)
    setExportMode('locations')

    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    const container = exportAreaRef.current
    if (!container) { setExporting(false); setExportMode('idle'); return }

    const els = Array.from(container.children) as HTMLElement[]

    try {
      if (els.length === 1) {
        const loc = selectedLocations[0]
        await downloadSinglePng(els[0], `location-${loc.id}.png`)
      } else {
        const filenames = selectedLocations.map((_, i) => `${i + 1}.png`)
        await downloadZip(els, filenames, 'location-labels.zip')
      }
    } finally {
      setExporting(false)
      setExportMode('idle')
    }
  }, [selectedLocations])

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Left panel ──────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-surface-border bg-surface-1">

        {/* Tab switcher */}
        <div className="flex border-b border-surface-border shrink-0">
          {(['spools', 'locations'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors
                ${tab === t
                  ? 'text-primary-300 border-b-2 border-primary-400 bg-primary-600/10'
                  : 'text-gray-500 hover:text-gray-300'
                }`}
            >
              {t === 'spools' ? 'Spools' : 'Locations'}
            </button>
          ))}
        </div>

        {tab === 'spools' ? (
          <>
            {/* Templates */}
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
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Spools picker */}
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
                {spoolsLoading ? (
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
          </>
        ) : (
          /* Locations picker */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-3 border-b border-surface-border space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Locations</p>
                <div className="flex gap-2 text-xs text-primary-400">
                  <button onClick={selectAllLocs}  className="hover:text-primary-300">All</button>
                  <span className="text-gray-600">·</span>
                  <button onClick={selectNoneLocs} className="hover:text-primary-300">None</button>
                </div>
              </div>
              {locSelected.size > 0 && (
                <p className="text-xs text-primary-400">{locSelected.size} selected</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
              {locsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-gray-300" />
                </div>
              ) : locations.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-500">No locations found</p>
              ) : (
                locations.map((loc) => {
                  const sel = locSelected.has(loc.id)
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => toggleLocation(loc.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
                        ${sel ? 'bg-primary-600/15' : 'hover:bg-surface-2'}`}
                    >
                      {sel
                        ? <CheckSquare className="h-4 w-4 shrink-0 text-primary-400" />
                        : <Square      className="h-4 w-4 shrink-0 text-gray-600" />}
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate leading-tight">{loc.name}</p>
                        <p className="text-xs text-gray-500 leading-none">
                          {loc.spool_count} spool{loc.spool_count !== 1 ? 's' : ''}
                          {loc.is_dry_box ? ' · Dry Box' : ''}
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ── Right: toolbar + preview ─────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {tab === 'spools' ? (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-start gap-4 px-5 py-4 border-b border-surface-border bg-surface-1 shrink-0">

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

              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-500">Preview size</p>
                <div className="flex gap-1">
                  {[1, 1.5, 2, 2.5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setPreviewScale(s)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors
                        ${previewScale === s
                          ? 'bg-primary-600 text-white'
                          : 'bg-surface-2 text-gray-400 hover:text-white border border-surface-border'
                        }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="ml-auto flex items-end">
                <ExportMenuButton
                  count={selectedSpools.length}
                  disabled={selectedSpools.length === 0}
                  exporting={exporting && exportMode === 'spools'}
                  onPdf={() => printLabels(PRINT_AREA_ID, columns, activeEntry.mmW, activeEntry.mmH)}
                  onPng={handleSpoolPng}
                />
              </div>
            </div>

            {/* Slot config popdown */}
            {showFieldCfg && (
              <div className="border-b border-surface-border bg-surface-2 px-5 py-3 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    {activeEntry.label} — data slots
                  </p>
                  {templateSlots[template] && (
                    <button
                      onClick={resetSlots}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Reset to defaults
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {currentSlots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Toggle
                        checked={slot.enabled}
                        onChange={(v) => updateSlots(currentSlots.map((s, j) => j === i ? { ...s, enabled: v } : s))}
                      />
                      <select
                        value={slot.field}
                        disabled={!slot.enabled}
                        onChange={(e) => updateSlots(currentSlots.map((s, j) => j === i ? { ...s, field: e.target.value as ClassicFieldOption } : s))}
                        className="flex-1 rounded-lg bg-surface border border-surface-border text-sm text-white px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        {CLASSIC_FIELD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <span className="text-[10px] text-gray-500 w-16 shrink-0 text-right">
                        {slot.enabled ? (CLASSIC_FIELD_LABELS[slot.field] || slot.field) : 'hidden'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spool preview */}
            <div className="flex-1 overflow-y-auto p-5 bg-surface">
              {selectedSpools.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
                  <QrCode className="h-12 w-12" />
                  <p className="text-sm">Select spools on the left to preview labels</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const px    = LABEL_PX[template]
                    const cellW = px.w * previewScale
                    const cellH = px.h * previewScale
                    return (
                      <div
                        className="grid gap-4 items-start"
                        style={{ gridTemplateColumns: `repeat(${columns}, ${cellW}px)` }}
                      >
                        {selectedSpools.map((spool) => (
                          <div key={spool.id} style={{ width: cellW, height: cellH, overflow: 'hidden' }}>
                            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                              <SpoolLabel spool={spool} template={template} slots={currentSlots} encoding={encoding} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  <div className="flex items-center gap-1.5 mt-4 text-xs text-gray-600">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    Labels print at actual size ({activeEntry.size}). Set your printer to no scaling / 100%.
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Locations toolbar */}
            <div className="flex flex-wrap items-center gap-4 px-5 py-4 border-b border-surface-border bg-surface-1 shrink-0">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <MapPin className="h-4 w-4" />
                Location QR codes link to the public location page (no login required)
              </div>
              <div className="ml-auto">
                <ExportMenuButton
                  count={selectedLocations.length}
                  disabled={selectedLocations.length === 0}
                  exporting={exporting && exportMode === 'locations'}
                  onPdf={() => printLocationLabels(LOC_PRINT_AREA_ID)}
                  onPng={handleLocationPng}
                />
              </div>
            </div>

            {/* Location preview */}
            <div className="flex-1 overflow-y-auto p-5 bg-surface">
              {selectedLocations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
                  <MapPin className="h-12 w-12" />
                  <p className="text-sm">Select locations on the left to preview QR codes</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 items-start">
                  {selectedLocations.map((loc) => (
                    <LocationBadgeLabel key={loc.id} location={loc} forScreen />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── PDF print portals ────────────────────────────────────────── */}
      {selectedSpools.length > 0 && createPortal(
        <div id={PRINT_AREA_ID} style={{ display: 'none' }}>
          {selectedSpools.map((spool) => (
            <SpoolLabel key={spool.id} spool={spool} template={template} slots={currentSlots} encoding={encoding} />
          ))}
        </div>,
        document.body,
      )}

      {selectedLocations.length > 0 && createPortal(
        <div id={LOC_PRINT_AREA_ID} style={{ display: 'none' }}>
          {selectedLocations.map((loc) => (
            <LocationBadgeLabel key={loc.id} location={loc} />
          ))}
        </div>,
        document.body,
      )}

      {/* ── PNG export portal — rendered off-screen at native pixel size ── */}
      {exportMode !== 'idle' && createPortal(
        <div
          ref={exportAreaRef}
          id={EXPORT_AREA_ID}
          style={{
            position: 'fixed',
            left: -9999,
            top: -9999,
            visibility: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            pointerEvents: 'none',
          }}
        >
          {exportMode === 'spools'
            ? selectedSpools.map((spool) => (
                <div key={spool.id} style={{ display: 'inline-block', lineHeight: 0 }}>
                  <SpoolLabel spool={spool} template={template} slots={currentSlots} encoding={encoding} />
                </div>
              ))
            : selectedLocations.map((loc) => (
                <div key={loc.id} style={{ display: 'inline-block', lineHeight: 0 }}>
                  <LocationBadgeLabel key={loc.id} location={loc} />
                </div>
              ))
          }
        </div>,
        document.body,
      )}

      {/* ── Exporting overlay ─────────────────────────────────────────── */}
      {exporting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-surface-border bg-surface-1 px-8 py-6 shadow-2xl">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-border border-t-primary-400" />
            <p className="text-sm font-medium text-white">Generating images…</p>
            <p className="text-xs text-gray-500">This may take a moment</p>
          </div>
        </div>
      )}
    </div>
  )
}
