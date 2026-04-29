import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/api/users'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsCard } from './SettingsCard'
import { ONBOARDING_KEY } from '@/features/onboarding/OnboardingFlow'
import { patchStoredGeneralPrefs } from '@/hooks/useGeneralPrefs'

type ViewMode   = 'grid' | 'table'
type DateRange  = '7d' | '30d' | '90d' | 'all'
type SortOrder  = 'date_added' | 'fill_pct' | 'material' | 'brand'
type PageSize   = 12 | 24 | 48 | 96

interface GeneralPrefs {
  view_mode:         ViewMode
  date_range:        DateRange
  sort_order:        SortOrder
  page_size:         PageSize
  delete_confirm:    boolean
  auto_sync:         boolean
  low_stock_banner:  boolean
  hotkeys:           boolean
}

const DEFAULTS: GeneralPrefs = {
  view_mode: 'grid', date_range: '30d', sort_order: 'date_added', page_size: 24,
  delete_confirm: true, auto_sync: true, low_stock_banner: true, hotkeys: true,
}

function PillGroup<T extends string | number>({
  options, value, onChange, label,
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
  label, description, checked, onChange,
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
  const qc = useQueryClient()

  const { data: serverPrefs } = useQuery({
    queryKey: ['ui-prefs'],
    queryFn:  usersApi.getUiPrefs,
    select:   (d) => (d as { general?: GeneralPrefs }).general,
  })

  const [prefs, setPrefs] = useState<GeneralPrefs>(DEFAULTS)

  useEffect(() => {
    if (serverPrefs) setPrefs((p) => ({ ...p, ...serverPrefs }))
  }, [serverPrefs])

  const saveMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => usersApi.updateUiPrefs({ general: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ui-prefs'] }),
  })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedSave = useCallback((patch: Partial<GeneralPrefs>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(
      () => saveMutation.mutate(patch as Record<string, unknown>),
      600,
    )
  }, [saveMutation])

  function set<K extends keyof GeneralPrefs>(key: K, val: GeneralPrefs[K]) {
    const updated = { ...prefs, [key]: val }
    setPrefs(updated)
    patchStoredGeneralPrefs({ [key]: val } as Partial<GeneralPrefs>)
    debouncedSave({ [key]: val })
  }

  return (
    <div className="space-y-6">
      <SettingsCard title="Default views" description="Starting state for lists and filters throughout the app.">
        <div className="space-y-5">
          <PillGroup<ViewMode>
            label="Inventory layout"
            value={prefs.view_mode}
            onChange={(v) => set('view_mode', v)}
            options={[
              { value: 'grid',  label: 'Grid'  },
              { value: 'table', label: 'Table' },
            ]}
          />
          <PillGroup<DateRange>
            label="Default date range"
            value={prefs.date_range}
            onChange={(v) => set('date_range', v)}
            options={[
              { value: '7d',  label: 'Last 7 days'  },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: 'all', label: 'All time'     },
            ]}
          />
          <PillGroup<SortOrder>
            label="Default sort order"
            value={prefs.sort_order}
            onChange={(v) => set('sort_order', v)}
            options={[
              { value: 'date_added', label: 'Date added' },
              { value: 'fill_pct',   label: 'Fill %'     },
              { value: 'material',   label: 'Material'   },
              { value: 'brand',      label: 'Brand'      },
            ]}
          />
          <PillGroup<PageSize>
            label="Items per page"
            value={prefs.page_size}
            onChange={(v) => set('page_size', v)}
            options={[
              { value: 12, label: '12' },
              { value: 24, label: '24' },
              { value: 48, label: '48' },
              { value: 96, label: '96' },
            ]}
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Onboarding" description="Setup guide and feature tour.">
        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-medium text-white">Setup guide</p>
            <p className="text-xs text-gray-500 mt-0.5">Re-run the onboarding flow to review setup steps and the feature tour.</p>
          </div>
          <button
            onClick={() => { localStorage.removeItem(ONBOARDING_KEY); window.location.reload() }}
            className="shrink-0 rounded-lg border border-surface-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-surface-3 hover:text-white transition-colors"
          >
            Restart setup
          </button>
        </div>
      </SettingsCard>

      <SettingsCard title="Behaviour" description="App-wide interaction and sync preferences.">
        <div className="divide-y divide-surface-border">
          <ToggleRow
            label="Delete confirmations"
            description="Show a confirmation dialog before permanently deleting items."
            checked={prefs.delete_confirm}
            onChange={(v) => set('delete_confirm', v)}
          />
          <ToggleRow
            label="Auto-sync"
            description="Automatically refresh data when the window regains focus."
            checked={prefs.auto_sync}
            onChange={(v) => set('auto_sync', v)}
          />
          <ToggleRow
            label="Low stock banners"
            description="Show a warning banner at the top of inventory when spools are running low."
            checked={prefs.low_stock_banner}
            onChange={(v) => set('low_stock_banner', v)}
          />
          <ToggleRow
            label="Keyboard shortcuts"
            description="Enable hotkeys for quick navigation and common actions."
            checked={prefs.hotkeys}
            onChange={(v) => set('hotkeys', v)}
          />
        </div>
      </SettingsCard>
    </div>
  )
}
