import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, Package } from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { formatWeight, formatRelative } from '@/utils/format'
import { useAuth } from '@/hooks/useAuth'
import type { SpoolStatus } from '@/types/api'

const STATUS_FILTERS: { label: string; value: SpoolStatus | '' }[] = [
  { label: 'All',      value: '' },
  { label: 'Active',   value: 'active' },
  { label: 'Empty',    value: 'empty' },
  { label: 'Drying',   value: 'drying' },
  { label: 'Archived', value: 'archived' },
]

const STATUS_BADGE: Record<SpoolStatus, 'success' | 'warning' | 'accent' | 'default'> = {
  active:   'success',
  drying:   'accent',
  empty:    'warning',
  archived: 'default',
}

export default function SpoolsPage() {
  const { isEditor } = useAuth()
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState<SpoolStatus | ''>('')
  const [page, setPage]         = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['spools', { search, status, page }],
    queryFn: () =>
      spoolsApi.list({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 24,
      }),
    placeholderData: (prev) => prev,
  })

  const spools = data?.items ?? []
  const total  = data?.total ?? 0
  const pages  = data?.pages ?? 1

  return (
    <div className="p-5 lg:p-7 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Spool Inventory</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            {total} spool{total !== 1 ? 's' : ''} total
          </p>
        </div>
        {isEditor && (
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add spool
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search spools…"
            className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setStatus(value); setPage(1) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                status === value
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : spools.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Package className="h-12 w-12 text-gray-600" />
          <p className="text-sm text-gray-400">No spools found.</p>
          {isEditor && (
            <Button size="sm" variant="secondary">
              <Plus className="h-4 w-4" />
              Add your first spool
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {spools.map((spool) => (
              <Card key={spool.id} className="flex flex-col gap-3 hover:border-primary-700/50 transition-colors cursor-pointer">
                {/* Color swatch + header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-9 w-9 shrink-0 rounded-lg border border-surface-border"
                      style={{
                        backgroundColor: spool.filament?.color_hex ?? '#6366f1',
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {spool.name ?? spool.filament?.name ?? `Spool #${spool.id}`}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {spool.brand?.name ?? spool.filament?.brand?.name ?? 'Unknown brand'}
                        {spool.filament?.material && ` · ${spool.filament.material}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={STATUS_BADGE[spool.status]} className="shrink-0">
                    {spool.status}
                  </Badge>
                </div>

                {/* Fill bar */}
                <div>
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>{formatWeight(spool.remaining_weight)} left</span>
                    <span>{spool.fill_percentage.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all"
                      style={{ width: `${Math.min(spool.fill_percentage, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <p className="text-xs text-gray-600">
                  {spool.last_used ? `Used ${formatRelative(spool.last_used)}` : 'Never used'}
                </p>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-400">
                Page {page} of {pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
