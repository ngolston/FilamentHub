import { useState } from 'react'
import { getStoredGeneralPrefs } from '@/hooks/useGeneralPrefs'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import {
  Activity, DollarSign, Package, TrendingDown, TrendingUp,
  AlertTriangle, CheckCircle, Clock, Printer as PrinterIcon,
} from 'lucide-react'
import { analyticsApi } from '@/api/analytics'
import { formatCurrency, formatWeight } from '@/utils/format'

// ── Shared constants ──────────────────────────────────────────────────────────

const MATERIAL_COLORS: Record<string, string> = {
  PLA:    '#06b6d4',
  PETG:   '#6366f1',
  ABS:    '#ef4444',
  TPU:    '#10b981',
  ASA:    '#8b5cf6',
  PA:     '#f59e0b',
  'PA-CF':'#d97706',
  Unknown:'#6b7280',
}
const MAT_COLOR = (m: string) => MATERIAL_COLORS[m] ?? '#94a3b8'

const PRINTER_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

const PERIODS = [
  { label: '7d',   days: 7   },
  { label: '30d',  days: 30  },
  { label: '90d',  days: 90  },
  { label: '1yr',  days: 365 },
]

// ── Tooltip styles ────────────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: { backgroundColor: '#1e2235', border: '1px solid #2d3352', borderRadius: 8, fontSize: 12 },
  itemStyle:    { color: '#e5e7eb' },
  labelStyle:   { color: '#9ca3af', marginBottom: 4 },
}

// ── Tiny reusable pieces ──────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent = 'indigo',
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; accent?: 'indigo' | 'cyan' | 'emerald' | 'amber'
}) {
  const colors = {
    indigo:  'bg-indigo-500/10 text-indigo-400',
    cyan:    'bg-cyan-500/10 text-cyan-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber:   'bg-amber-500/10 text-amber-400',
  }
  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-4 flex items-start gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors[accent]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-white leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-4">
      <p className="text-sm font-semibold text-white mb-3">{title}</p>
      {children}
    </div>
  )
}

function EmptyChart({ message = 'No data for this period' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
      {message}
    </div>
  )
}

// ── Period selector ───────────────────────────────────────────────────────────

function PeriodPicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          onClick={() => onChange(p.days)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors
            ${days === p.days
              ? 'bg-primary-600 text-white'
              : 'bg-surface-2 text-gray-400 hover:text-white border border-surface-border'
            }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ days }: { days: number }) {
  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary', days],
    queryFn:  () => analyticsApi.summary(days),
  })
  const { data: daily = [] } = useQuery({
    queryKey: ['analytics', 'daily', days],
    queryFn:  () => analyticsApi.daily(days),
  })
  const { data: material } = useQuery({
    queryKey: ['analytics', 'material', days],
    queryFn:  () => analyticsApi.byMaterial(days),
  })

  // Thin daily data to ~30 ticks max so labels don't crowd
  const tickEvery = Math.max(1, Math.ceil(daily.length / 30))
  const dailyTrimmed = daily.filter((_, i) => i % tickEvery === 0)

  const donutData = material?.breakdown.map((b) => ({
    name: b.material, value: b.total_grams,
  })) ?? []

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total used"
          value={formatWeight(summary?.total_used_g ?? 0)}
          sub={`over ${days} days`}
          icon={Activity}
          accent="indigo"
        />
        <KpiCard
          label="Avg daily"
          value={`${(summary?.avg_daily_g ?? 0).toFixed(1)} g/day`}
          icon={TrendingUp}
          accent="cyan"
        />
        <KpiCard
          label="Spools depleted"
          value={String(summary?.spools_depleted ?? 0)}
          icon={Package}
          accent="amber"
        />
        <KpiCard
          label="Total spend"
          value={formatCurrency(summary?.total_spend ?? 0)}
          sub="registered spools"
          icon={DollarSign}
          accent="emerald"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Daily bar chart */}
          <ChartCard title="Daily consumption">
            {daily.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyTrimmed} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#2d3352" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => format(parseISO(d), 'd MMM')}
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}g`}
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [`${(v as number).toFixed(1)} g`, 'Used']}
                    labelFormatter={(d) => format(parseISO(String(d)), 'MMM d, yyyy')}
                  />
                  <Bar dataKey="grams" fill="url(#barGrad)" radius={[3, 3, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Cumulative line */}
          <ChartCard title="Cumulative usage">
            {daily.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#2d3352" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => format(parseISO(d), 'd MMM')}
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    interval={tickEvery - 1}
                  />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(1)}kg`}
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [formatWeight(v as number), 'Total']}
                    labelFormatter={(d) => format(parseISO(String(d)), 'MMM d, yyyy')}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Material donut */}
        <ChartCard title="By material">
          {donutData.length === 0 ? <EmptyChart /> : (
            <div className="flex flex-col items-center gap-2">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={MAT_COLOR(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [formatWeight(v as number)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full space-y-1.5">
                {material?.breakdown.map((b) => (
                  <div key={b.material} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: MAT_COLOR(b.material) }} />
                      <span className="text-gray-300">{b.material}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-gray-500">{formatWeight(b.total_grams)}</span>
                      <span className="text-gray-600 w-8 text-right">{b.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: By Material
// ─────────────────────────────────────────────────────────────────────────────

function MaterialTab({ days }: { days: number }) {
  const { data } = useQuery({
    queryKey: ['analytics', 'material', days],
    queryFn:  () => analyticsApi.byMaterial(days),
  })

  const weekly  = data?.weekly ?? []
  const breakdown = data?.breakdown ?? []
  const materials = data?.materials ?? []
  const topMats   = materials.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Stacked weekly bar */}
      <ChartCard title="Weekly usage by material">
        {weekly.length === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#2d3352" strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}g`} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, name) => [`${(v as number).toFixed(1)} g`, name as string]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af', paddingTop: 8 }} />
              {topMats.map((m) => (
                <Bar key={m} dataKey={m} stackId="a" fill={MAT_COLOR(m)} radius={[0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Individual sparkline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {breakdown.map((b) => {
          // Build per-material sparkline from weekly data
          const spark = weekly.map((w) => ({ week: w.week as string, g: (w[b.material] as number) ?? 0 }))
          const totalWeeks = spark.filter((w) => w.g > 0).length
          return (
            <div
              key={b.material}
              className="rounded-xl border border-surface-border bg-surface-1 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MAT_COLOR(b.material) }} />
                  <span className="text-sm font-semibold text-white">{b.material}</span>
                </div>
                <span className="text-xs text-gray-500 tabular-nums">{b.pct}% of total</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-lg font-bold text-white">{formatWeight(b.total_grams)}</p>
                  <p className="text-xs text-gray-500">{b.avg_daily_g.toFixed(1)} g/day avg</p>
                </div>
                <span className="text-xs text-gray-600">{totalWeeks} active weeks</span>
              </div>
              {spark.length > 0 && (
                <ResponsiveContainer width="100%" height={52}>
                  <LineChart data={spark}>
                    <Line type="monotone" dataKey="g" stroke={MAT_COLOR(b.material)} strokeWidth={1.5} dot={false} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v) => [`${(v as number).toFixed(1)} g`, b.material]}
                      labelFormatter={(l) => String(l)}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: By Printer
// ─────────────────────────────────────────────────────────────────────────────

function PrinterTab({ days }: { days: number }) {
  const { data } = useQuery({
    queryKey: ['analytics', 'printer', days],
    queryFn:  () => analyticsApi.byPrinter(days),
  })

  const stats  = data?.stats ?? []
  const daily  = data?.daily ?? []
  const printerNames = stats.map((s) => s.printer_name)

  const totalG = stats.reduce((s, p) => s + p.total_grams, 0)

  return (
    <div className="space-y-4">
      {/* Printer stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.length === 0
          ? <p className="text-sm text-gray-500 col-span-3">No print jobs recorded for this period.</p>
          : stats.map((p, i) => (
            <div key={p.printer_id ?? i} className="rounded-xl border border-surface-border bg-surface-1 p-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${PRINTER_COLORS[i % PRINTER_COLORS.length]}20`, color: PRINTER_COLORS[i % PRINTER_COLORS.length] }}
                >
                  <PrinterIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{p.printer_name}</p>
                  <p className="text-lg font-bold text-white mt-0.5">{formatWeight(p.total_grams)}</p>
                  <p className="text-xs text-gray-500">{p.pct}% of total</p>
                </div>
              </div>
              {/* Usage bar */}
              <div className="mt-3 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${p.pct}%`, backgroundColor: PRINTER_COLORS[i % PRINTER_COLORS.length] }}
                />
              </div>
              {/* Top materials */}
              {p.top_materials.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {p.top_materials.map((m) => (
                    <span
                      key={m}
                      className="rounded-full px-1.5 py-px text-[10px] font-medium"
                      style={{ backgroundColor: `${MAT_COLOR(m)}20`, color: MAT_COLOR(m) }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        }
      </div>

      {/* Multi-line chart */}
      {daily.length > 0 && printerNames.length > 0 && (
        <ChartCard title="Daily usage by printer">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#2d3352" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), 'd MMM')}
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false} tickLine={false}
              />
              <YAxis tickFormatter={(v) => `${v}g`} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, name) => [`${(v as number).toFixed(1)} g`, name as string]}
                labelFormatter={(d) => format(parseISO(String(d)), 'MMM d, yyyy')}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af', paddingTop: 8 }} />
              {printerNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={PRINTER_COLORS[i % PRINTER_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Ranked bar */}
      {totalG > 0 && (
        <ChartCard title="Ranked usage">
          <div className="space-y-3">
            {stats.map((p, i) => (
              <div key={p.printer_id ?? i}>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{p.printer_name}</span>
                  <span className="tabular-nums">{formatWeight(p.total_grams)}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${p.pct}%`, backgroundColor: PRINTER_COLORS[i % PRINTER_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Cost Tracking
// ─────────────────────────────────────────────────────────────────────────────

function CostTab() {
  const { data } = useQuery({
    queryKey: ['analytics', 'cost'],
    queryFn:  analyticsApi.cost,
  })

  const history = data?.monthly_history ?? []
  const byMat   = data?.cost_by_material ?? []
  const maxCost = Math.max(...byMat.map((m) => m.cost_per_kg), 1)

  // Format month label "2024-04" → "Apr '24"
  const fmtMonth = (m: string) => {
    try { return format(parseISO(`${m}-01`), "MMM ''yy") } catch { return m }
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total invested"      value={formatCurrency(data?.total_invested ?? 0)}       icon={DollarSign}   accent="emerald" />
        <KpiCard label="Blended $/kg"        value={formatCurrency(data?.blended_cost_per_kg ?? 0)}  icon={TrendingDown}  accent="cyan"    />
        <KpiCard label="This month"          value={formatCurrency(data?.this_month_spend ?? 0)}     icon={Activity}      accent="indigo"  />
        <KpiCard label="Projected monthly"   value={formatCurrency(data?.projected_monthly ?? 0)}   sub="6-month avg"   icon={TrendingUp} accent="amber"   />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly purchase history */}
        <ChartCard title="Monthly spend history">
          {history.length === 0 ? <EmptyChart message="No purchase data recorded" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#2d3352" strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtMonth}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v) => [formatCurrency(v as number), 'Spend']}
                  labelFormatter={(m) => fmtMonth(String(m))}
                />
                <Bar dataKey="spend" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Cost per material */}
        <ChartCard title="Cost per kg by material">
          {byMat.length === 0 ? <EmptyChart message="Add purchase prices to spools to see cost breakdown" /> : (
            <div className="space-y-3 mt-1">
              {byMat.map((m) => (
                <div key={m.material}>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MAT_COLOR(m.material) }} />
                      <span>{m.material}</span>
                    </div>
                    <span className="tabular-nums">{formatCurrency(m.cost_per_kg)}/kg</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(m.cost_per_kg / maxCost) * 100}%`, backgroundColor: MAT_COLOR(m.material) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Run-out Forecast
// ─────────────────────────────────────────────────────────────────────────────

function ForecastTab() {
  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ['analytics', 'forecast'],
    queryFn:  analyticsApi.forecast,
  })

  const critical = forecasts.filter((f) => f.severity === 'critical')
  const warning  = forecasts.filter((f) => f.severity === 'warning')
  const ok       = forecasts.filter((f) => f.severity === 'ok')

  const severityStyle = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    warning:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
    ok:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  }
  const severityIcon = {
    critical: AlertTriangle,
    warning:  Clock,
    ok:       CheckCircle,
  }
  const severityLabel = {
    critical: 'Critical',
    warning:  'Warning',
    ok:       'OK',
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-gray-300" />
      </div>
    )
  }

  if (forecasts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
        <Package className="h-10 w-10" />
        <p className="text-sm">No active spools with usage data.</p>
        <p className="text-xs text-gray-700">Log some print jobs to see runout forecasts.</p>
      </div>
    )
  }

  const SpoolRow = ({ f }: { f: typeof forecasts[0] }) => {
    const Icon = severityIcon[f.severity as keyof typeof severityIcon]
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-surface-border bg-surface-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${severityStyle[f.severity as keyof typeof severityStyle]}`}
        >
          <Icon className="h-3 w-3" />
          {severityLabel[f.severity as keyof typeof severityLabel]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{f.spool_name}</p>
          <p className="text-xs text-gray-500">
            {f.remaining_g.toFixed(0)} g remaining
            {f.avg_daily_g > 0 ? ` · ${f.avg_daily_g.toFixed(1)} g/day` : ' · no recent usage'}
          </p>
        </div>
        <div className="text-right shrink-0">
          {f.days_remaining != null ? (
            <>
              <p className="text-sm font-bold text-white tabular-nums">
                {f.days_remaining < 1 ? '< 1' : Math.round(f.days_remaining)} days
              </p>
              {f.estimated_runout && (
                <p className="text-[11px] text-gray-500">
                  {format(new Date(f.estimated_runout), 'MMM d, yyyy')}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-600">No usage data</p>
          )}
        </div>
      </div>
    )
  }

  const groups = [
    { label: 'Critical (< 7 days)', items: critical, color: 'text-red-400' },
    { label: 'Warning (< 30 days)',  items: warning,  color: 'text-amber-400' },
    { label: 'OK',                   items: ok,       color: 'text-emerald-400' },
  ]

  return (
    <div className="space-y-6">
      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Critical', count: critical.length, cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
          { label: 'Warning',  count: warning.length,  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
          { label: 'OK',       count: ok.length,       cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
        ].map((g) => (
          <span key={g.label} className={`rounded-full border px-3 py-1 text-sm font-medium ${g.cls}`}>
            {g.count} {g.label}
          </span>
        ))}
      </div>

      {groups.map((g) => g.items.length > 0 && (
        <div key={g.label}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${g.color}`}>{g.label}</p>
          <div className="space-y-2">
            {g.items.map((f) => <SpoolRow key={f.spool_id} f={f} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'By Material', 'By Printer', 'Cost Tracking', 'Run-out Forecast'] as const
type Tab = typeof TABS[number]

export default function AnalyticsPage() {
  const [tab,  setTab]  = useState<Tab>('Overview')
  const [days, setDays] = useState(() => {
    const dr = getStoredGeneralPrefs().date_range
    return dr === '7d' ? 7 : dr === '90d' ? 90 : dr === 'all' ? 365 : 30
  })

  const showPeriod = tab !== 'Cost Tracking' && tab !== 'Run-out Forecast'

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-surface-border bg-surface-1 shrink-0">
        {/* Tabs */}
        <div className="flex gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap
                ${tab === t
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-surface-2'
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Period switcher */}
        {showPeriod && (
          <div className="ml-auto">
            <PeriodPicker days={days} onChange={setDays} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {tab === 'Overview'           && <OverviewTab  days={days} />}
        {tab === 'By Material'        && <MaterialTab  days={days} />}
        {tab === 'By Printer'         && <PrinterTab   days={days} />}
        {tab === 'Cost Tracking'      && <CostTab />}
        {tab === 'Run-out Forecast'   && <ForecastTab />}
      </div>
    </div>
  )
}
