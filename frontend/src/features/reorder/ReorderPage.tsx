import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ShoppingCart, ExternalLink, AlertTriangle, CheckCircle2,
  Search, Copy, Check, Filter, Package, TrendingDown,
  DollarSign, ChevronDown, ChevronUp, Zap, X,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { analyticsApi } from '@/api/analytics'
import { formatWeight, formatCurrency } from '@/utils/format'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'
import type { SpoolResponse } from '@/types/api'
import type { SpoolForecast } from '@/types/api'

// ── Constants ──────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, ok: 2 }
const TARGET_DAYS = 60   // suggest enough stock for 60 days

// ── Helpers ────────────────────────────────────────────────────────────────────

function suggestedQty(spool: SpoolResponse, forecast: SpoolForecast | undefined): number {
  if (!forecast || forecast.avg_daily_g === 0) {
    return spool.fill_percentage <= 20 ? 1 : 0
  }
  const needed    = forecast.avg_daily_g * TARGET_DAYS
  const shortfall = needed - spool.remaining_weight
  if (shortfall <= 0) return 0
  return Math.max(1, Math.ceil(shortfall / spool.initial_weight))
}

function supplierSearchUrl(spool: SpoolResponse): string {
  const mat   = spool.filament?.material ?? ''
  const brand = spool.brand?.name ?? spool.filament?.brand?.name ?? ''
  const name  = spool.filament?.name ?? ''
  const q     = encodeURIComponent([brand, mat, name, '1kg filament'].filter(Boolean).join(' '))
  return `https://www.amazon.com/s?k=${q}`
}

function severityLabel(sev: string, daysLeft: number | null | undefined): string {
  if (sev === 'critical') return daysLeft != null ? `Runs out in ${Math.round(daysLeft)}d` : 'Critically low'
  if (sev === 'warning')  return daysLeft != null ? `Runs out in ${Math.round(daysLeft)}d` : 'Running low'
  return 'Low stock'
}

// ── Row component ──────────────────────────────────────────────────────────────

interface ReorderItem {
  spool:     SpoolResponse
  forecast:  SpoolForecast | undefined
  severity:  'critical' | 'warning' | 'ok'
  qty:       number
  checked:   boolean
}

function ReorderRow({
  item, onToggle,
}: {
  item: ReorderItem
  onToggle: () => void
}) {
  const { spool, forecast, severity, qty } = item
  const name    = spool.name ?? spool.filament?.name ?? `Spool #${spool.id}`
  const brand   = spool.brand?.name ?? spool.filament?.brand?.name ?? null
  const mat     = spool.filament?.material ?? null
  const color   = spool.filament?.color_hex ?? spool.color_hex ?? '#6b7280'
  const pct     = spool.fill_percentage
  const hasLink = Boolean(spool.product_url)

  const badgeVariant = severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'default'

  const estCost = spool.purchase_price != null ? spool.purchase_price * qty : null

  return (
    <div className={cn(
      'flex items-start gap-4 rounded-xl border p-4 transition-colors',
      item.checked
        ? 'border-surface-border bg-surface-1/40 opacity-60'
        : severity === 'critical'
          ? 'border-red-500/30 bg-red-500/5'
          : severity === 'warning'
            ? 'border-yellow-500/20 bg-yellow-500/5'
            : 'border-surface-border bg-surface-1',
    )}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
          item.checked
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-surface-border hover:border-gray-400',
        )}
      >
        {item.checked && <Check className="h-3 w-3" />}
      </button>

      {/* Color swatch */}
      <div
        className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-surface-1"
        style={{ backgroundColor: color }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-semibold', item.checked ? 'line-through text-gray-500' : 'text-white')}>
            {name}
          </span>
          {brand && <span className="text-xs text-gray-500">{brand}</span>}
          {mat && (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-gray-300">{mat}</span>
          )}
          <Badge variant={badgeVariant} className="text-xs">
            {severityLabel(severity, forecast?.days_remaining)}
          </Badge>
        </div>

        {/* Fill bar */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn('h-full rounded-full transition-all', severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-yellow-400' : 'bg-accent-400')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-gray-500">{pct.toFixed(0)}% · {formatWeight(spool.remaining_weight)} left</span>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {forecast && forecast.avg_daily_g > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {formatWeight(forecast.avg_daily_g)}/day avg
            </span>
          )}
          {spool.supplier && (
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {spool.supplier}
            </span>
          )}
        </div>
      </div>

      {/* Right: qty + links */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5">
          <ShoppingCart className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-sm font-semibold text-white">{qty}×</span>
          <span className="text-xs text-gray-500">suggested</span>
        </div>
        {estCost != null && (
          <span className="text-xs text-gray-500">≈ {formatCurrency(estCost)}</span>
        )}
        <div className="flex items-center gap-1">
          {hasLink ? (
            <a
              href={spool.product_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-primary-700/40 bg-primary-900/20 px-2.5 py-1 text-xs font-medium text-primary-300 hover:bg-primary-800/30 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Buy
            </a>
          ) : (
            <a
              href={supplierSearchUrl(spool)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-gray-400 hover:bg-surface-3 hover:text-gray-200 transition-colors"
            >
              <Search className="h-3 w-3" />
              Search
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'critical' | 'warning' | 'unchecked'
type SortMode   = 'urgency' | 'material' | 'fill'

export default function ReorderPage() {
  const [checked,   setChecked]   = useState<Set<number>>(new Set())
  const [filter,    setFilter]    = useState<FilterMode>('all')
  const [sort,      setSort]      = useState<SortMode>('urgency')
  const [copied,    setCopied]    = useState(false)
  const [showSorts, setShowSorts] = useState(false)

  const { data: spoolsPage, isLoading: spoolsLoading } = useQuery({
    queryKey: ['spools', 'reorder'],
    queryFn: () => spoolsApi.list({ status: 'active,storage', page_size: 200 }),
  })

  const { data: forecasts, isLoading: forecastLoading } = useQuery({
    queryKey: ['analytics', 'forecast'],
    queryFn: analyticsApi.forecast,
  })

  const forecastMap = useMemo(() => {
    const m = new Map<number, SpoolForecast>()
    for (const f of forecasts ?? []) m.set(f.spool_id, f)
    return m
  }, [forecasts])

  // Build the reorder list: spools below 30% fill OR <14 days remaining
  const allItems = useMemo((): ReorderItem[] => {
    const spools = spoolsPage?.items ?? []
    return spools
      .filter((s) => {
        const f = forecastMap.get(s.id)
        const lowFill = s.fill_percentage <= 30
        const soonOut = f?.days_remaining != null && f.days_remaining <= 14
        return lowFill || soonOut
      })
      .map((s): ReorderItem => {
        const f   = forecastMap.get(s.id)
        const sev = (f?.severity === 'critical' || f?.severity === 'warning')
          ? f.severity
          : s.fill_percentage <= 10 ? 'critical' : 'warning'
        return {
          spool:    s,
          forecast: f,
          severity: sev as 'critical' | 'warning' | 'ok',
          qty:      suggestedQty(s, f),
          checked:  checked.has(s.id),
        }
      })
  }, [spoolsPage, forecastMap, checked])

  const filteredItems = useMemo(() => {
    let items = allItems
    if (filter === 'critical')  items = items.filter((i) => i.severity === 'critical')
    if (filter === 'warning')   items = items.filter((i) => i.severity === 'warning')
    if (filter === 'unchecked') items = items.filter((i) => !i.checked)

    return [...items].sort((a, b) => {
      if (sort === 'urgency')  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (sort === 'material') {
        const ma = a.spool.filament?.material ?? 'z'
        const mb = b.spool.filament?.material ?? 'z'
        return ma.localeCompare(mb)
      }
      if (sort === 'fill') return a.spool.fill_percentage - b.spool.fill_percentage
      return 0
    })
  }, [allItems, filter, sort])

  // Stats
  const totalItems    = allItems.length
  const checkedCount  = allItems.filter((i) => i.checked).length
  const criticalCount = allItems.filter((i) => i.severity === 'critical').length
  const totalSpend    = allItems
    .filter((i) => !i.checked && i.spool.purchase_price != null)
    .reduce((sum, i) => sum + (i.spool.purchase_price! * i.qty), 0)

  function toggleChecked(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function copyList() {
    const lines = filteredItems
      .filter((i) => !i.checked)
      .map((i) => {
        const name  = i.spool.name ?? i.spool.filament?.name ?? `Spool #${i.spool.id}`
        const brand = i.spool.brand?.name ?? i.spool.filament?.brand?.name ?? ''
        const mat   = i.spool.filament?.material ?? ''
        return `${i.qty}× ${[brand, mat, name].filter(Boolean).join(' ')} (${i.spool.fill_percentage.toFixed(0)}% left)`
      })
      .join('\n')
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isLoading = spoolsLoading || forecastLoading

  return (
    <div className="p-5 lg:p-7 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary-400" />
            Reorder List
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Low-stock spools that need replenishing, sorted by urgency
          </p>
        </div>

        <button
          onClick={copyList}
          disabled={filteredItems.every((i) => i.checked)}
          className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-surface-3 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy list'}
        </button>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-red-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold text-white">{criticalCount}</p>
          <p className="text-xs text-gray-500">Critical</p>
        </Card>
        <Card className="flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary-500" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-primary-400">
            <TrendingDown className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold text-white">{totalItems}</p>
          <p className="text-xs text-gray-500">Need reorder</p>
        </Card>
        <Card className="flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold text-white">{checkedCount}</p>
          <p className="text-xs text-gray-500">Ordered / done</p>
        </Card>
        <Card className="flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-500" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-accent-400">
            <DollarSign className="h-4 w-4" />
          </div>
          <p className="text-2xl font-semibold text-white">{totalSpend > 0 ? formatCurrency(totalSpend) : '—'}</p>
          <p className="text-xs text-gray-500">Est. total spend</p>
        </Card>
      </div>

      {/* ── Filter + Sort bar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-2 p-1">
          {(['all', 'critical', 'warning', 'unchecked'] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200',
              )}
            >
              {f === 'unchecked' ? 'To buy' : f === 'all' ? `All (${totalItems})` : f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowSorts((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Filter className="h-3.5 w-3.5" />
            Sort: {sort}
            {showSorts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showSorts && (
            <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-xl border border-surface-border bg-surface-1 shadow-2xl py-1">
              {([['urgency', 'Urgency'], ['material', 'Material'], ['fill', 'Fill %']] as [SortMode, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => { setSort(k); setShowSorts(false) }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm transition-colors',
                    sort === k ? 'text-primary-300 bg-primary-900/20' : 'text-gray-300 hover:bg-surface-2',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── List ────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
          <p className="text-base font-semibold text-white">
            {totalItems === 0 ? 'All stocked up!' : 'Nothing to show'}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {totalItems === 0
              ? 'No spools are running low right now. Great job keeping inventory topped up.'
              : 'Try changing the filter above.'}
          </p>
          {totalItems === 0 && (
            <Link
              to="/spools"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 transition-colors"
            >
              <Package className="h-4 w-4" />
              View all spools
            </Link>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <ReorderRow
              key={item.spool.id}
              item={item}
              onToggle={() => toggleChecked(item.spool.id)}
            />
          ))}

          {/* Checked-off summary */}
          {checkedCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-1 px-4 py-3 mt-2">
              <span className="text-sm text-gray-400">
                <span className="text-emerald-400 font-semibold">{checkedCount}</span> item{checkedCount !== 1 ? 's' : ''} marked as ordered
              </span>
              <button
                onClick={() => setChecked(new Set())}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tips ────────────────────────────────────────────────────────────── */}
      {!isLoading && totalItems > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-1 p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-400">Tips</p>
          <p>• Suggested quantity covers {TARGET_DAYS} days of usage based on your average consumption.</p>
          <p>• Add a <span className="text-gray-300">Product URL</span> to a spool for a direct buy link — edit any spool to set this.</p>
          <p>• Tick a row to mark it as ordered — the list resets when you reload the page.</p>
        </div>
      )}
    </div>
  )
}
