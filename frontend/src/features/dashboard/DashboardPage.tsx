import { useQuery } from '@tanstack/react-query'
import {
  Package,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  BarChart3,
} from 'lucide-react'
import { analyticsApi } from '@/api/analytics'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatWeight, formatCurrency, formatDate, severityColor } from '@/utils/format'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { user } = useAuth()

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => analyticsApi.summary(30),
  })

  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ['analytics', 'forecast'],
    queryFn: analyticsApi.forecast,
  })

  const criticalSpools = forecast?.filter((f) => f.severity === 'critical') ?? []
  const warningSpools  = forecast?.filter((f) => f.severity === 'warning')  ?? []

  return (
    <div className="p-5 lg:p-7 space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-semibold text-white">
          Welcome back, {user?.display_name ?? 'Maker'} 👋
        </h2>
        <p className="mt-0.5 text-sm text-gray-400">Last 30 days at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Filament used"
          value={summaryLoading ? null : formatWeight(summary?.total_used_g ?? 0)}
          icon={Package}
          color="text-accent-400"
        />
        <StatCard
          label="Daily average"
          value={summaryLoading ? null : formatWeight(summary?.avg_daily_g ?? 0)}
          icon={BarChart3}
          color="text-primary-400"
        />
        <StatCard
          label="Total spend"
          value={summaryLoading ? null : formatCurrency(summary?.total_spend ?? 0)}
          icon={DollarSign}
          color="text-green-400"
        />
        <StatCard
          label="Spools depleted"
          value={summaryLoading ? null : String(summary?.spools_depleted ?? 0)}
          icon={TrendingDown}
          color="text-yellow-400"
        />
      </div>

      {/* Runout forecast */}
      <Card>
        <CardHeader>
          <CardTitle>Runout Forecast</CardTitle>
          {(criticalSpools.length > 0 || warningSpools.length > 0) && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {criticalSpools.length + warningSpools.length} at risk
            </Badge>
          )}
        </CardHeader>

        {forecastLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !forecast?.length ? (
          <p className="py-6 text-center text-sm text-gray-500">
            No spools tracked yet. Add a spool to see forecasts.
          </p>
        ) : (
          <div className="space-y-3">
            {forecast.map((spool) => (
              <div
                key={spool.spool_id}
                className="flex items-center gap-4 rounded-lg bg-surface-2 px-4 py-3"
              >
                {/* Fill bar */}
                <div className="w-24 shrink-0">
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>{spool.spool_name}</span>
                    <span>{spool.fill_pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all"
                      style={{ width: `${Math.min(spool.fill_pct, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-white">{spool.spool_name}</p>
                  <p className="text-xs text-gray-500">{formatWeight(spool.remaining_g)} remaining</p>
                </div>

                <div className="text-right shrink-0">
                  {spool.estimated_runout ? (
                    <>
                      <p className={`text-sm font-medium ${severityColor(spool.severity)}`}>
                        {spool.days_remaining != null ? `${spool.days_remaining}d` : '—'}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(spool.estimated_runout)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No usage data</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string | null
  icon: React.ElementType
  color: string
}) {
  return (
    <Card className="flex flex-col gap-3">
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
      </div>
    </Card>
  )
}
