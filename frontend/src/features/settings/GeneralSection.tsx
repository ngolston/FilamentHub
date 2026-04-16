import { useLocalSetting } from '@/hooks/useLocalSetting'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsCard } from './SettingsCard'

type ViewMode   = 'grid' | 'table'
type DateRange  = '7d' | '30d' | '90d' | 'all'
type SortOrder  = 'date_added' | 'fill_pct' | 'material' | 'brand'
type PageSize   = 12 | 24 | 48 | 96

function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-sm font-medium text-gray-300">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              value === opt.value
                ? 'rounded-lg px-3 py-1.5 text-sm font-medium bg-primary-600 text-white'
                : 'rounded-lg px-3 py-1.5 text-sm font-medium bg-surface-2 text-gray-300 hover:text-white border border-surface-border hover:border-gray-500 transition-colors'
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-surface-border last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export function GeneralSection() {
  const [viewMode,   setViewMode]   = useLocalSetting<ViewMode>('fh_view_mode', 'grid')
  const [dateRange,  setDateRange]  = useLocalSetting<DateRange>('fh_date_range', '30d')
  const [sortOrder,  setSortOrder]  = useLocalSetting<SortOrder>('fh_sort_order', 'date_added')
  const [pageSize,   setPageSize]   = useLocalSetting<PageSize>('fh_page_size', 24)
  const [deleteConf, setDeleteConf] = useLocalSetting('fh_delete_confirm', true)
  const [autoSync,   setAutoSync]   = useLocalSetting('fh_auto_sync', true)
  const [lowStock,   setLowStock]   = useLocalSetting('fh_low_stock_banner', true)
  const [hotkeys,    setHotkeys]    = useLocalSetting('fh_hotkeys', true)

  return (
    <div className="space-y-6">
      <SettingsCard title="Default views" description="Starting state for lists and filters throughout the app.">
        <div className="space-y-5">
          <PillGroup<ViewMode>
            label="Inventory layout"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'grid',  label: 'Grid'  },
              { value: 'table', label: 'Table' },
            ]}
          />
          <PillGroup<DateRange>
            label="Default date range"
            value={dateRange}
            onChange={setDateRange}
            options={[
              { value: '7d',  label: 'Last 7 days'  },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: 'all', label: 'All time'     },
            ]}
          />
          <PillGroup<SortOrder>
            label="Default sort order"
            value={sortOrder}
            onChange={setSortOrder}
            options={[
              { value: 'date_added', label: 'Date added' },
              { value: 'fill_pct',   label: 'Fill %'     },
              { value: 'material',   label: 'Material'   },
              { value: 'brand',      label: 'Brand'      },
            ]}
          />
          <PillGroup<PageSize>
            label="Items per page"
            value={pageSize}
            onChange={setPageSize}
            options={[
              { value: 12, label: '12' },
              { value: 24, label: '24' },
              { value: 48, label: '48' },
              { value: 96, label: '96' },
            ]}
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Behaviour" description="App-wide interaction and sync preferences.">
        <div className="divide-y divide-surface-border">
          <ToggleRow
            label="Delete confirmations"
            description="Show a confirmation dialog before permanently deleting items."
            checked={deleteConf}
            onChange={setDeleteConf}
          />
          <ToggleRow
            label="Auto-sync"
            description="Automatically refresh data when the window regains focus."
            checked={autoSync}
            onChange={setAutoSync}
          />
          <ToggleRow
            label="Low stock banners"
            description="Show a warning banner at the top of inventory when spools are running low."
            checked={lowStock}
            onChange={setLowStock}
          />
          <ToggleRow
            label="Keyboard shortcuts"
            description="Enable hotkeys for quick navigation and common actions."
            checked={hotkeys}
            onChange={setHotkeys}
          />
        </div>
      </SettingsCard>
    </div>
  )
}
