import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, parseISO, startOfDay, isSameDay } from 'date-fns'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  Package,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Printer as PrinterIcon,
  QrCode,
  ChevronRight,
  Activity,
  Zap,
  BarChart3,
  Layers,
  MapPin,
  Archive,
  Droplets,
} from 'lucide-react'
import { analyticsApi } from '@/api/analytics'
import { spoolsApi } from '@/api/spools'
import { printersApi } from '@/api/printers'
import { printJobsApi } from '@/api/print-jobs'
import { locationsApi } from '@/api/locations'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/utils/cn'
import { formatWeight, formatCurrency } from '@/utils/format'
import type { SpoolResponse, PrinterResponse, PrinterStatus } from '@/types/api'

// ── Color helpers ─────────────────────────────────────────────────────────────

const MATERIAL_COLORS: Record<string, string> = {
  PLA:  '#06b6d4',
  PETG: '#6366f1',
  ABS:  '#ef4444',
  TPU:  '#10b981',
  ASA:  '#8b5cf6',
  PA:   '#f59e0b',
  PC:   '#ec4899',
  FLEX: '#14b8a6',
}
function materialColor(m: string) {
  return MATERIAL_COLORS[m?.toUpperCase()] ?? '#6b7280'
}

function spoolStatus(pct: number): 'ok' | 'low' | 'critical' {
  if (pct <= 10) return 'critical'
  if (pct <= 30) return 'low'
  return 'ok'
}

const STATUS_LABEL  = { ok: 'OK',       low: 'Low',     critical: 'Critical' }
const STATUS_DOT_CL = { ok: 'bg-emerald-500', low: 'bg-yellow-400', critical: 'bg-red-500 animate-pulse' }
const STATUS_TEXT_CL = { ok: 'text-emerald-400', low: 'text-yellow-400', critical: 'text-red-400' }
const STATUS_BG_CL   = { ok: 'bg-emerald-500/10', low: 'bg-yellow-400/10', critical: 'bg-red-500/10' }

// ── Sub-components ────────────────────────────────────────────────────────────

function SpoolRing({ fill, color }: { fill: number; color: string }) {
  const r = 18
  const circ = 2 * Math.PI * r
  const filled = Math.min(Math.max(fill, 0), 100)
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#232840" strokeWidth="5" />
      {filled > 0 && (
        <circle
          cx="24" cy="24" r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(filled / 100) * circ} ${circ}`}
          transform="rotate(-90 24 24)"
        />
      )}
      <circle cx="24" cy="24" r="5" fill="#1c2030" />
    </svg>
  )
}

function StatCard({
  label, value, icon: Icon, color, subtext,
}: {
  label: string
  value: string | null
  icon: React.ElementType
  color: string
  subtext?: string
}) {
  return (
    <Card className="flex flex-col gap-3 relative overflow-hidden">
      {/* subtle glow stripe */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${color.replace('text-', 'bg-').replace('-400', '-500').replace('-300', '-500')}`} />
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        {value == null ? (
          <div className="h-7 w-20 animate-pulse rounded bg-surface-3" />
        ) : (
          <p className="text-2xl font-semibold text-white">{value}</p>
        )}
        <p className="mt-0.5 text-xs text-gray-500">{label}</p>
        {subtext && <p className="mt-1 text-xs text-gray-600">{subtext}</p>}
      </div>
    </Card>
  )
}

function WeeklyChart({ days }: { days: { label: string; grams: number }[] }) {
  const max = Math.max(...days.map((d) => d.grams), 1)
  const W = 300
  const H = 90
  const barW = 28
  const gap = (W - days.length * barW) / (days.length + 1)

  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" style={{ maxHeight: 130 }}>
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {days.map((d, i) => {
        const x = gap + i * (barW + gap)
        const h = (d.grams / max) * H
        const y = H - h
        return (
          <g key={d.label}>
            {/* bar background */}
            <rect x={x} y={0} width={barW} height={H} rx="4" fill="#232840" />
            {/* filled bar */}
            {d.grams > 0 && (
              <rect x={x} y={y} width={barW} height={h} rx="4" fill="url(#barGrad)" />
            )}
            {/* day label */}
            <text
              x={x + barW / 2}
              y={H + 16}
              textAnchor="middle"
              fill="#6b7280"
              fontSize="9"
              fontFamily="Poppins, sans-serif"
            >
              {d.label}
            </text>
            {/* value on top if > 0 */}
            {d.grams > 0 && (
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize="7"
                fontFamily="Poppins, sans-serif"
              >
                {d.grams < 1000 ? `${d.grams}g` : `${(d.grams / 1000).toFixed(1)}k`}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function MaterialDonut({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  const r = 38
  const cx = 60
  const cy = 60
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.pct, 0) || 1

  let cumulative = 0
  const arcs = segments.map((seg) => {
    const norm = seg.pct / total
    const angle = cumulative * 360
    cumulative += norm
    return { ...seg, norm, angle }
  })

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        {arcs.length === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#232840" strokeWidth="12" />
        ) : (
          arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth="12"
              strokeDasharray={`${arc.norm * circ * 0.95} ${circ}`}
              strokeLinecap="butt"
              transform={`rotate(${arc.angle - 90} ${cx} ${cy})`}
            />
          ))
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="14" fontWeight="600" fontFamily="Poppins, sans-serif">
          {segments.length}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#6b7280" fontSize="7" fontFamily="Poppins, sans-serif">
          materials
        </text>
      </svg>

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-gray-400">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpoolCard({ spool, assignment }: { spool: SpoolResponse; assignment?: string }) {
  const color = spool.filament?.color_hex ?? '#6366f1'
  const pct   = spool.fill_percentage
  const st    = spoolStatus(pct)
  const name  = spool.name ?? spool.filament?.name ?? 'Unnamed Spool'
  const brand = spool.brand?.name ?? spool.filament?.brand?.name ?? null
  const mat   = spool.filament?.material ?? null

  return (
    <div className={cn('rounded-xl border bg-surface-1 p-3 flex gap-3 items-start', st === 'critical' ? 'border-red-500/30' : 'border-surface-border')}>
      <SpoolRing fill={pct} color={color} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {brand && <span className="text-xs text-gray-500 truncate">{brand}</span>}
          {mat && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: materialColor(mat) + '22', color: materialColor(mat) }}
            >
              {mat}
            </span>
          )}
        </div>

        {/* fill bar */}
        <div className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
          {assignment ? (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-300 bg-primary-900/30 border border-primary-700/30 px-1.5 py-0.5 rounded-full truncate max-w-[140px]">
              <PrinterIcon className="h-2.5 w-2.5 shrink-0" />
              {assignment}
            </span>
          ) : (
            <span className={cn('flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full', STATUS_TEXT_CL[st], STATUS_BG_CL[st])}>
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_CL[st])} />
              {STATUS_LABEL[st]}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const PRINTER_STATUS_COLORS: Record<PrinterStatus, string> = {
  printing: 'bg-emerald-500 animate-pulse',
  idle:     'bg-emerald-500',
  paused:   'bg-yellow-400',
  error:    'bg-red-500',
  offline:  'bg-gray-600',
}
const PRINTER_STATUS_TEXT: Record<PrinterStatus, string> = {
  printing: 'Printing…',
  idle:     'Idle',
  paused:   'Paused',
  error:    'Error',
  offline:  'Offline',
}

function PrinterCard({ printer }: { printer: PrinterResponse }) {
  const allSlots = printer.ams_units.flatMap((u) => u.slots)
  const loadedSlots = allSlots.filter((s) => s.spool !== null)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-gray-400">
            <PrinterIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{printer.name}</p>
            {printer.model && <p className="text-xs text-gray-500 truncate">{printer.model}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('h-2 w-2 rounded-full', PRINTER_STATUS_COLORS[printer.status])} />
          <span className="text-xs text-gray-400">{PRINTER_STATUS_TEXT[printer.status]}</span>
        </div>
      </div>

      {/* AMS slots */}
      {loadedSlots.length > 0 ? (
        <div>
          <p className="text-xs text-gray-600 mb-1.5">Loaded filament</p>
          <div className="flex gap-1.5 flex-wrap">
            {loadedSlots.map((slot) => {
              const hex = slot.spool?.filament?.color_hex ?? '#6b7280'
              const mat = slot.spool?.filament?.material ?? null
              const nm  = slot.spool?.filament?.name ?? slot.spool?.name ?? '?'
              return (
                <div
                  key={slot.slot_index}
                  className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1"
                  title={`Slot ${slot.slot_index + 1}: ${nm}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: hex }} />
                  {mat && <span className="text-xs text-gray-400">{mat}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-600">No filament loaded</p>
      )}
    </Card>
  )
}

// ── Spool Value Summary ───────────────────────────────────────────────────────

interface ValueRow { label: string; invested: number; current: number; count: number; color: string }

function SpoolValuePanel({ rows, totalInvested, totalCurrent }: {
  rows: ValueRow[]
  totalInvested: number
  totalCurrent: number
}) {
  const maxInvested = Math.max(...rows.map((r) => r.invested), 1)

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <div>
          <CardTitle>Spool Value</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">Inventory worth</p>
        </div>
        <DollarSign className="h-4 w-4 text-emerald-400" />
      </CardHeader>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-surface-2 px-3 py-2.5">
          <p className="text-xs text-gray-500 mb-0.5">Total invested</p>
          <p className="text-lg font-semibold text-white">{formatCurrency(totalInvested)}</p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2.5">
          <p className="text-xs text-gray-500 mb-0.5">Current value</p>
          <p className="text-lg font-semibold text-emerald-400">{formatCurrency(totalCurrent)}</p>
          <p className="text-[10px] text-gray-600">
            {totalInvested > 0 ? `${((totalCurrent / totalInvested) * 100).toFixed(0)}% remaining` : '—'}
          </p>
        </div>
      </div>

      {/* Per-material breakdown */}
      {rows.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-2">No purchase prices recorded</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: row.color }} />
                  <span className="text-xs text-gray-300">{row.label}</span>
                  <span className="text-[10px] text-gray-600">{row.count} spool{row.count !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-xs text-gray-400">{formatCurrency(row.invested)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(row.invested / maxInvested) * 100}%`, background: row.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Storage Locations Overview ────────────────────────────────────────────────

interface LocationRow { id: number | null; name: string; count: number; isDryBox: boolean; weight: number }

function StorageLocationsPanel({ rows, totalSpools }: {
  rows: LocationRow[]
  totalSpools: number
}) {
  const maxCount = Math.max(...rows.map((r) => r.count), 1)

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader>
        <div>
          <CardTitle>Storage</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">{totalSpools} spool{totalSpools !== 1 ? 's' : ''} across {rows.length} location{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <MapPin className="h-4 w-4 text-primary-400" />
      </CardHeader>

      {rows.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-4">No storage locations set up yet</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id ?? 'unassigned'}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {row.isDryBox ? (
                    <Droplets className="h-3.5 w-3.5 text-accent-400 shrink-0" />
                  ) : (
                    <Archive className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                  )}
                  <span className={cn('text-sm truncate', row.id === null ? 'text-gray-500 italic' : 'text-gray-200')}>
                    {row.name}
                  </span>
                  {row.isDryBox && (
                    <span className="text-[10px] text-accent-400 border border-accent-400/30 rounded px-1 shrink-0">Dry</span>
                  )}
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className="text-xs text-gray-400">{row.count} spool{row.count !== 1 ? 's' : ''}</span>
                  {row.weight > 0 && (
                    <span className="text-[10px] text-gray-600 ml-1.5">{formatWeight(row.weight)}</span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(row.count / maxCount) * 100}%`,
                    background: row.isDryBox ? '#06b6d4' : '#6366f1',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const today = new Date()

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => analyticsApi.summary(30),
  })
  const { data: forecast } = useQuery({
    queryKey: ['analytics', 'forecast'],
    queryFn: analyticsApi.forecast,
  })
  const { data: spoolsPage } = useQuery({
    queryKey: ['spools', 'dashboard'],
    queryFn: () => spoolsApi.list({ status: 'active', page_size: 12 }),
  })
  const { data: allSpoolsPage } = useQuery({
    queryKey: ['spools', 'dashboard-all'],
    queryFn: () => spoolsApi.list({ status: 'active,storage', page_size: 200 }),
  })
  const { data: locations } = useQuery({
    queryKey: ['locations', 'dashboard'],
    queryFn: locationsApi.list,
  })
  const { data: printers } = useQuery({
    queryKey: ['printers', 'dashboard'],
    queryFn: printersApi.list,
  })
  const { data: jobsPage } = useQuery({
    queryKey: ['print-jobs', 'dashboard'],
    queryFn: () => printJobsApi.list({ page_size: 200 }),
  })

  // Alert: critical/warning spools
  const criticalSpools = forecast?.filter((f) => f.severity === 'critical') ?? []
  const warningSpools  = forecast?.filter((f) => f.severity === 'warning')  ?? []

  // Weekly usage chart: last 7 days
  const weekData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i)
      return { date: d, label: format(d, 'EEE'), grams: 0 }
    })
    for (const job of jobsPage?.items ?? []) {
      if (!job.finished_at) continue
      const jobDay = startOfDay(parseISO(job.finished_at))
      const slot = days.find((d) => isSameDay(d.date, jobDay))
      if (slot) slot.grams += job.filament_used_g
    }
    return days.map((d) => ({ label: d.label, grams: Math.round(d.grams) }))
  }, [jobsPage, today])

  // Material donut: from active + storage spools
  const materialData = useMemo(() => {
    const spools = allSpoolsPage?.items ?? []
    const counts: Record<string, number> = {}
    for (const s of spools) {
      const mat = s.filament?.material ?? 'Unknown'
      counts[mat] = (counts[mat] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        pct: count / total,
        color: materialColor(label),
      }))
  }, [spoolsPage])

  // Spool value: grouped by material, only spools with a purchase_price
  const { valueRows, totalInvested, totalCurrent } = useMemo(() => {
    const spools = allSpoolsPage?.items ?? []
    const byMat: Record<string, { invested: number; current: number; count: number }> = {}
    let ti = 0, tc = 0
    for (const s of spools) {
      if (!s.purchase_price) continue
      const mat = s.filament?.material ?? 'Unknown'
      const cur = s.purchase_price * (s.fill_percentage / 100)
      ti += s.purchase_price
      tc += cur
      if (!byMat[mat]) byMat[mat] = { invested: 0, current: 0, count: 0 }
      byMat[mat].invested += s.purchase_price
      byMat[mat].current  += cur
      byMat[mat].count    += 1
    }
    const rows: ValueRow[] = Object.entries(byMat)
      .sort((a, b) => b[1].invested - a[1].invested)
      .map(([label, v]) => ({ label, ...v, color: materialColor(label) }))
    return { valueRows: rows, totalInvested: ti, totalCurrent: tc }
  }, [allSpoolsPage])

  // Storage locations: count spools per location
  const { locationRows, totalStoredSpools } = useMemo(() => {
    const spools = allSpoolsPage?.items ?? []
    const byLoc: Record<string, LocationRow> = {}

    // seed from known locations so empty ones still appear
    for (const loc of locations ?? []) {
      byLoc[String(loc.id)] = {
        id: loc.id, name: loc.name, count: 0,
        isDryBox: loc.is_dry_box, weight: 0,
      }
    }

    let unassigned = 0, unassignedWeight = 0
    for (const s of spools) {
      if (s.location) {
        const key = String(s.location.id)
        if (byLoc[key]) {
          byLoc[key].count  += 1
          byLoc[key].weight += s.remaining_weight
        }
      } else {
        unassigned++
        unassignedWeight += s.remaining_weight
      }
    }

    const rows: LocationRow[] = Object.values(byLoc).sort((a, b) => b.count - a.count)
    if (unassigned > 0) {
      rows.push({ id: null, name: 'Unassigned', count: unassigned, isDryBox: false, weight: unassignedWeight })
    }
    return { locationRows: rows, totalStoredSpools: spools.length }
  }, [allSpoolsPage, locations])

  const activeSpools = spoolsPage?.items ?? []
  const visiblePrinters = (printers ?? []).slice(0, 3)
  const totalSpools = allSpoolsPage?.total ?? 0
  const isNewUser = allSpoolsPage !== undefined && totalSpools === 0

  // Map spoolId → assignment label e.g. "P1 · A2" or "P1 · External 1"
  const spoolAssignments = useMemo(() => {
    const map = new Map<number, string>()
    for (const printer of printers ?? []) {
      const sortedUnits = [...printer.ams_units].sort((a, b) => a.unit_index - b.unit_index)
      sortedUnits.forEach((unit, unitIdx) => {
        const letter = String.fromCharCode(65 + unitIdx) // A, B, C…
        for (const slot of unit.slots) {
          if (slot.spool_id != null) {
            map.set(slot.spool_id, `${printer.name} · ${letter}${slot.slot_index + 1}`)
          }
        }
      })
      if (printer.direct_spool_id != null) {
        map.set(printer.direct_spool_id, `${printer.name} · External 1`)
      }
    }
    return map
  }, [printers])

  // ── Onboarding: brand-new account with no spools ─────────────────────────
  if (isNewUser) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-lg text-center space-y-6">
          {/* Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 border border-primary-700/30">
            <Package className="h-8 w-8 text-primary-400" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">Welcome to FilamentHub, {user?.display_name}!</h2>
            <p className="mt-2 text-gray-400">
              You don't have any spools yet. Get started by adding your first spool or importing from Spoolman.
            </p>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            {[
              {
                num: '1',
                title: 'Add a filament profile',
                desc: 'Create a reusable spec for each material you use.',
                href: '/filaments',
                color: 'bg-primary-600/20 text-primary-300 border-primary-700/30',
              },
              {
                num: '2',
                title: 'Add your first spool',
                desc: 'Log a physical spool and link it to a profile.',
                href: '/spools/new',
                color: 'bg-accent-600/20 text-accent-300 border-accent-700/30',
              },
              {
                num: '3',
                title: 'Connect a printer',
                desc: 'Track which filament is loaded on each machine.',
                href: '/printers',
                color: 'bg-emerald-600/20 text-emerald-300 border-emerald-700/30',
              },
            ].map((step) => (
              <Link
                key={step.num}
                to={step.href}
                className={`group flex flex-col gap-2 rounded-xl border p-4 transition-all hover:brightness-125 ${step.color}`}
              >
                <span className="text-xs font-bold uppercase tracking-wider opacity-60">Step {step.num}</span>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-xs opacity-70">{step.desc}</p>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            <Link
              to="/spools/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              <Package className="h-4 w-4" />
              Add first spool
            </Link>
            <Link
              to="/community"
              className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-2 hover:bg-surface-3 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors"
            >
              Import from Spoolman
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 lg:p-7 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Welcome back, {user?.display_name ?? 'Maker'} 👋
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            {format(today, 'EEEE, MMMM d')} · Last 30 days at a glance
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">Live</span>
        </div>
      </div>

      {/* ── Low stock alert banner ───────────────────────────────────────────── */}
      {(criticalSpools.length > 0 || warningSpools.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-center gap-2 shrink-0">
            <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
            <span className="text-sm font-semibold text-red-300">
              {criticalSpools.length > 0
                ? `${criticalSpools.length} spool${criticalSpools.length > 1 ? 's' : ''} running critical`
                : `${warningSpools.length} spool${warningSpools.length > 1 ? 's' : ''} running low`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...criticalSpools, ...warningSpools].slice(0, 4).map((s) => (
              <span
                key={s.spool_id}
                className="rounded-full bg-surface-2 border border-surface-border px-2.5 py-0.5 text-xs text-gray-300"
              >
                {s.spool_name} · {s.fill_pct.toFixed(0)}%
              </span>
            ))}
          </div>
          <Link
            to="/spools"
            className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-300 shrink-0"
          >
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Filament used"
          value={summaryLoading ? null : formatWeight(summary?.total_used_g ?? 0)}
          icon={Package}
          color="text-accent-400"
          subtext="30-day total"
        />
        <StatCard
          label="Daily average"
          value={summaryLoading ? null : formatWeight(summary?.avg_daily_g ?? 0)}
          icon={BarChart3}
          color="text-primary-400"
          subtext="per day"
        />
        <StatCard
          label="Total spend"
          value={summaryLoading ? null : formatCurrency(summary?.total_spend ?? 0)}
          icon={DollarSign}
          color="text-emerald-400"
          subtext="tracked purchases"
        />
        <StatCard
          label="Spools depleted"
          value={summaryLoading ? null : String(summary?.spools_depleted ?? 0)}
          icon={TrendingDown}
          color="text-yellow-400"
          subtext="fully consumed"
        />
      </div>

      {/* ── Charts row ───────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Weekly usage chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Weekly Usage</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">Filament consumed (grams)</p>
            </div>
            <Zap className="h-4 w-4 text-accent-400" />
          </CardHeader>
          <WeeklyChart days={weekData} />
        </Card>

        {/* Material donut */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>By Material</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">Active &amp; Storage</p>
            </div>
            <Layers className="h-4 w-4 text-primary-400" />
          </CardHeader>
          {materialData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-gray-600 text-xs">
              No active or storage spools
            </div>
          ) : (
            <MaterialDonut segments={materialData} />
          )}
        </Card>
      </div>

      {/* ── Spool inventory grid ─────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Active Spools</h3>
          <Link
            to="/spools"
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
          >
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {activeSpools.length === 0 ? (
          <Card className="py-10 text-center">
            <Package className="mx-auto h-8 w-8 text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">No active spools yet.</p>
            <Link
              to="/spools/new"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
            >
              Add your first spool
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeSpools.map((spool) => (
              <SpoolCard key={spool.id} spool={spool} assignment={spoolAssignments.get(spool.id)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Printers ─────────────────────────────────────────────────────────── */}
      {visiblePrinters.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Printers</h3>
            <Link
              to="/printers"
              className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
            >
              Manage <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePrinters.map((p) => (
              <PrinterCard key={p.id} printer={p} />
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom row: QR + Value + Storage ────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* QR Labels section */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>QR Labels</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">Print and scan for quick lookup</p>
            </div>
            <QrCode className="h-4 w-4 text-primary-400" />
          </CardHeader>

          <div className="flex items-center gap-5">
            {/* Sample QR */}
            <div className="shrink-0 rounded-xl border border-surface-border bg-white p-2.5 shadow-inner">
              <QRCodeSVG
                value="https://filamenthub.app/spools/1"
                size={80}
                bgColor="#ffffff"
                fgColor="#0f1117"
                level="M"
              />
            </div>

            <div className="flex-1 space-y-3">
              <p className="text-sm text-gray-400">
                Generate QR codes for any spool. Scan to instantly pull up specs, remaining weight, and usage history.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/qr-labels"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-500 transition-colors"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  Open QR Labels
                </Link>
                <Link
                  to="/qr-labels"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-2 px-3.5 py-2 text-sm font-medium text-gray-300 hover:bg-surface-3 hover:text-white transition-colors"
                >
                  Batch Print
                </Link>
              </div>
            </div>
          </div>
        </Card>

        {/* Spool Value Summary */}
        <SpoolValuePanel
          rows={valueRows}
          totalInvested={totalInvested}
          totalCurrent={totalCurrent}
        />

        {/* Storage Locations */}
        <StorageLocationsPanel
          rows={locationRows}
          totalSpools={totalStoredSpools}
        />
      </div>

    </div>
  )
}
