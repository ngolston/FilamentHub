import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, X, Package, Tag, Printer as PrinterIcon, ClipboardList,
  Zap, Settings as SettingsIcon, Clock, CornerDownLeft, AlertTriangle,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { brandsApi } from '@/api/brands'
import { printersApi } from '@/api/printers'
import { printJobsApi } from '@/api/print-jobs'
import { cn } from '@/utils/cn'
import type { SpoolResponse, BrandResponse, PrinterResponse, PrintJobResponse } from '@/types/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultType = 'spool' | 'brand' | 'printer' | 'history' | 'action' | 'setting'
type FilterTab  = 'all' | ResultType

interface SearchResult {
  id:        string
  type:      ResultType
  title:     string
  subtitle?: string
  href?:     string
  action?:   () => void
  colorHex?: string
  score:     number
  tags?:     string[]
}

interface QuickJump {
  label:      string
  icon:       React.ReactNode
  query:      string
  filter:     FilterTab
  colorClass: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all',     label: 'All'      },
  { value: 'spool',   label: 'Spools'   },
  { value: 'brand',   label: 'Brands'   },
  { value: 'printer', label: 'Printers' },
  { value: 'history', label: 'History'  },
  { value: 'action',  label: 'Actions'  },
  { value: 'setting', label: 'Settings' },
]

const TYPE_ICON: Record<ResultType, React.ReactNode> = {
  spool:   <Package      className="h-4 w-4" />,
  brand:   <Tag          className="h-4 w-4" />,
  printer: <PrinterIcon  className="h-4 w-4" />,
  history: <ClipboardList className="h-4 w-4" />,
  action:  <Zap          className="h-4 w-4" />,
  setting: <SettingsIcon className="h-4 w-4" />,
}

const TYPE_COLOR: Record<ResultType, string> = {
  spool:   'bg-primary-900/50 text-primary-400',
  brand:   'bg-cyan-900/40 text-cyan-400',
  printer: 'bg-emerald-900/40 text-emerald-400',
  history: 'bg-orange-900/40 text-orange-400',
  action:  'bg-violet-900/40 text-violet-400',
  setting: 'bg-surface-3 text-gray-400',
}

const STATIC_ACTIONS: SearchResult[] = [
  {
    id: 'action-add-spool', type: 'action', score: 0,
    title: 'Add new spool',
    subtitle: 'Create a new spool entry in your inventory',
    href: '/spools/new',
    tags: ['add', 'create', 'new', 'spool', 'inventory'],
  },
  {
    id: 'action-add-filament', type: 'action', score: 0,
    title: 'Add filament profile',
    subtitle: 'Create a reusable filament profile with print settings',
    href: '/filaments',
    tags: ['add', 'create', 'filament', 'profile', 'material'],
  },
  {
    id: 'action-add-printer', type: 'action', score: 0,
    title: 'Add printer',
    subtitle: 'Register a new printer or device',
    href: '/printers',
    tags: ['add', 'create', 'printer', 'device', 'bambu', 'octoprint'],
  },
  {
    id: 'action-export-csv', type: 'action', score: 0,
    title: 'Export inventory CSV',
    subtitle: 'Download your full spool inventory as a CSV file',
    href: '/settings',
    tags: ['export', 'download', 'csv', 'backup', 'data'],
  },
  {
    id: 'action-sync-printers', type: 'action', score: 0,
    title: 'Sync all printers',
    subtitle: 'Poll all connected printers for latest status',
    href: '/printers',
    tags: ['sync', 'refresh', 'printers', 'status', 'update'],
  },
  {
    id: 'action-add-brand', type: 'action', score: 0,
    title: 'Add brand',
    subtitle: 'Add a new filament manufacturer to the database',
    href: '/filaments',
    tags: ['add', 'brand', 'manufacturer', 'hatchbox', 'bambu', 'overture'],
  },
]

const STATIC_SETTINGS: SearchResult[] = [
  {
    id: 'setting-appearance', type: 'setting', score: 0,
    title: 'Appearance',
    subtitle: 'Theme, density, font size',
    href: '/settings',
    tags: ['theme', 'dark', 'light', 'appearance', 'color', 'font', 'ui'],
  },
  {
    id: 'setting-profile', type: 'setting', score: 0,
    title: 'Profile',
    subtitle: 'Display name, maker name, avatar',
    href: '/settings',
    tags: ['profile', 'name', 'avatar', 'display', 'maker'],
  },
  {
    id: 'setting-security', type: 'setting', score: 0,
    title: 'Security',
    subtitle: 'Password and session management',
    href: '/settings',
    tags: ['password', 'security', 'session', 'change', 'login'],
  },
  {
    id: 'setting-2fa', type: 'setting', score: 0,
    title: 'Two-factor authentication',
    subtitle: 'TOTP authenticator app setup',
    href: '/settings',
    tags: ['2fa', 'totp', 'mfa', 'authenticator', 'security', 'two factor'],
  },
  {
    id: 'setting-discord', type: 'setting', score: 0,
    title: 'Discord integration',
    subtitle: 'Webhook notifications for low-stock alerts',
    href: '/settings',
    tags: ['discord', 'webhook', 'notifications', 'integration', 'alerts'],
  },
  {
    id: 'setting-api-keys', type: 'setting', score: 0,
    title: 'API keys',
    subtitle: 'Create and manage API access tokens',
    href: '/settings',
    tags: ['api', 'keys', 'token', 'access', 'developer'],
  },
  {
    id: 'setting-notifications', type: 'setting', score: 0,
    title: 'Notifications',
    subtitle: 'Alert thresholds and delivery preferences',
    href: '/settings',
    tags: ['notifications', 'alerts', 'email', 'threshold', 'low stock'],
  },
  {
    id: 'setting-backup', type: 'setting', score: 0,
    title: 'Backup & restore',
    subtitle: 'Export and import your inventory data',
    href: '/settings',
    tags: ['backup', 'restore', 'import', 'export', 'data', 'json'],
  },
]

const QUICK_JUMPS: QuickJump[] = [
  {
    label: 'PLA spools',
    icon: <Package className="h-4 w-4" />,
    query: 'PLA', filter: 'spool',
    colorClass: 'bg-primary-900/40 text-primary-400 border-primary-700/30',
  },
  {
    label: 'Critical stock',
    icon: <AlertTriangle className="h-4 w-4" />,
    query: 'critical', filter: 'all',
    colorClass: 'bg-red-900/40 text-red-400 border-red-700/30',
  },
  {
    label: 'Bambu Lab',
    icon: <PrinterIcon className="h-4 w-4" />,
    query: 'bambu', filter: 'all',
    colorClass: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/30',
  },
  {
    label: 'Settings',
    icon: <SettingsIcon className="h-4 w-4" />,
    query: '', filter: 'setting',
    colorClass: 'bg-surface-3 text-gray-400 border-surface-border',
  },
]

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreText(query: string, text: string | null | undefined, weight = 1): number {
  if (!text || !query) return 0
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  if (!t.includes(q)) return 0
  if (t === q)         return Math.round(100 * weight)
  if (t.startsWith(q)) return Math.round(80  * weight)
  return                     Math.round(60  * weight)
}

function scoreSpool(q: string, s: SpoolResponse): number {
  return Math.max(
    scoreText(q, s.name,                  1.0),
    scoreText(q, s.filament?.name,        0.9),
    scoreText(q, s.filament?.material,    0.85),
    scoreText(q, s.filament?.brand?.name, 0.8),
    scoreText(q, s.filament?.color_name,  0.7),
    scoreText(q, s.location?.name,        0.6),
    scoreText(q, s.status,                0.5),
    scoreText(q, s.supplier,              0.5),
    scoreText(q, s.lot_nr,                0.4),
    scoreText(q, s.notes,                 0.3),
  )
}

function scoreBrand(q: string, b: BrandResponse): number {
  return Math.max(
    scoreText(q, b.name,               1.0),
    scoreText(q, b.country_of_origin,  0.7),
    scoreText(q, b.notes,              0.4),
  )
}

function scorePrinter(q: string, p: PrinterResponse): number {
  return Math.max(
    scoreText(q, p.name,            1.0),
    scoreText(q, p.model,           0.9),
    scoreText(q, p.connection_type, 0.7),
    scoreText(q, p.status,          0.6),
    scoreText(q, p.serial_number,   0.5),
    scoreText(q, p.notes,           0.3),
  )
}

function scoreJob(q: string, j: PrintJobResponse): number {
  return Math.max(
    scoreText(q, j.file_name,      1.0),
    scoreText(q, j.outcome,        0.8),
    scoreText(q, j.printer?.name,  0.7),
    scoreText(q, j.notes,          0.4),
  )
}

function scoreStatic(q: string, item: SearchResult): number {
  return Math.max(
    scoreText(q, item.title,    1.0),
    scoreText(q, item.subtitle, 0.7),
    ...(item.tags ?? []).map((t) => scoreText(q, t, 0.5)),
  )
}

// ── Highlight ─────────────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const q   = query.toLowerCase().trim()
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded-sm bg-primary-600/30 px-0.5 text-primary-300">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  )
}

// ── Recent searches ───────────────────────────────────────────────────────────

const RECENT_KEY = 'fh_search_recent'
const MAX_RECENT = 3

function useRecentSearches(): [string[], (s: string) => void, () => void] {
  const [recents, setRecents] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
  })

  const push = useCallback((s: string) => {
    const trimmed = s.trim()
    if (!trimmed || trimmed.length < 2) return
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, MAX_RECENT)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(RECENT_KEY)
    setRecents([])
  }, [])

  return [recents, push, clear]
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  isOpen:  boolean
  onClose: () => void
}

export function CommandPalette({ isOpen, onClose }: Props) {
  const navigate  = useNavigate()
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  const [query,         setQuery]     = useState('')
  const [debounced,     setDebounced] = useState('')
  const [activeTab,     setActiveTab] = useState<FilterTab>('all')
  const [selectedIdx,   setIdx]       = useState(0)
  const [recents, pushRecent, clearRecent] = useRecentSearches()

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150)
    return () => clearTimeout(t)
  }, [query])

  // Reset on open
  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setDebounced('')
    setActiveTab('all')
    setIdx(0)
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [isOpen])

  // Data
  const { data: spoolsData } = useQuery({
    queryKey: ['cmd-spools', debounced],
    queryFn:  () => spoolsApi.list({ search: debounced || undefined, page_size: 8, status: 'active,storage' }),
    enabled:  isOpen && debounced.length >= 1,
    staleTime: 10_000,
  })

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn:  brandsApi.list,
    enabled:  isOpen,
    staleTime: 60_000,
  })

  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn:  printersApi.list,
    enabled:  isOpen,
    staleTime: 30_000,
  })

  const { data: jobsData } = useQuery({
    queryKey: ['cmd-jobs'],
    queryFn:  () => printJobsApi.list({ page_size: 50 }),
    enabled:  isOpen,
    staleTime: 30_000,
  })

  // Build full result set
  const allResults: SearchResult[] = useMemo(() => {
    const q = debounced.trim()
    // When no query, only show results if a specific tab is active
    const needsQuery = !q && activeTab === 'all'
    if (needsQuery) return []

    const out: SearchResult[] = []

    // Spools
    for (const s of spoolsData?.items ?? []) {
      const score = q ? scoreSpool(q, s) : (activeTab === 'spool' ? 1 : 0)
      if (score <= 0) continue
      const title =
        (s.name ??
        s.filament?.name ??
        [s.filament?.brand?.name, s.filament?.material].filter(Boolean).join(' ')
        ) || `Spool #${s.id}`
      out.push({
        id: `spool-${s.id}`,
        type: 'spool',
        title,
        subtitle: [s.filament?.material, s.filament?.brand?.name, s.location?.name]
          .filter(Boolean).join(' · ') || undefined,
        href:     `/spools/${s.id}/edit`,
        colorHex: s.filament?.color_hex ?? undefined,
        score,
      })
    }

    // Brands
    for (const b of brands) {
      const score = q ? scoreBrand(q, b) : (activeTab === 'brand' ? 1 : 0)
      if (score <= 0) continue
      out.push({
        id:       `brand-${b.id}`,
        type:     'brand',
        title:    b.name,
        subtitle: [b.country_of_origin, b.notes?.slice(0, 60)].filter(Boolean).join(' · ') || undefined,
        href:     '/filaments',
        score,
      })
    }

    // Printers
    for (const p of printers) {
      const score = q ? scorePrinter(q, p) : (activeTab === 'printer' ? 1 : 0)
      if (score <= 0) continue
      out.push({
        id:       `printer-${p.id}`,
        type:     'printer',
        title:    p.name + (p.model ? ` — ${p.model}` : ''),
        subtitle: `${p.connection_type} · ${p.status}`,
        href:     '/printers',
        score,
      })
    }

    // Print jobs
    for (const j of jobsData?.items ?? []) {
      const score = q ? scoreJob(q, j) : (activeTab === 'history' ? 1 : 0)
      if (score <= 0) continue
      out.push({
        id:       `job-${j.id}`,
        type:     'history',
        title:    j.file_name || `Job #${j.id}`,
        subtitle: [j.printer?.name, j.outcome, j.filament_used_g ? `${j.filament_used_g}g` : null]
          .filter(Boolean).join(' · '),
        href:     '/print-jobs',
        score,
      })
    }

    // Actions
    for (const a of STATIC_ACTIONS) {
      const score = q ? scoreStatic(q, a) : (activeTab === 'action' ? 1 : 0)
      if (score <= 0) continue
      out.push({ ...a, score })
    }

    // Settings
    for (const s of STATIC_SETTINGS) {
      const score = q ? scoreStatic(q, s) : (activeTab === 'setting' ? 1 : 0)
      if (score <= 0) continue
      out.push({ ...s, score })
    }

    return out.sort((a, b) => b.score - a.score)
  }, [debounced, activeTab, spoolsData, brands, printers, jobsData])

  // Filtered by active tab
  const filtered = useMemo(
    () => activeTab === 'all' ? allResults : allResults.filter((r) => r.type === activeTab),
    [allResults, activeTab],
  )

  // Tab counts
  const counts = useMemo(() => {
    const c: Partial<Record<FilterTab, number>> = { all: allResults.length }
    for (const r of allResults) c[r.type] = (c[r.type] ?? 0) + 1
    return c
  }, [allResults])

  // Reset selection when results change
  useEffect(() => { setIdx(0) }, [filtered])

  // Activate a result
  const activate = useCallback((result: SearchResult) => {
    if (query.trim().length >= 2) pushRecent(query.trim())
    if (result.action) result.action()
    else if (result.href) navigate(result.href)
    onClose()
  }, [query, pushRecent, navigate, onClose])

  // Keyboard
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }

      if (e.key === 'Tab') {
        e.preventDefault()
        const cur = FILTER_TABS.findIndex((t) => t.value === activeTab)
        const next = e.shiftKey
          ? (cur - 1 + FILTER_TABS.length) % FILTER_TABS.length
          : (cur + 1) % FILTER_TABS.length
        setActiveTab(FILTER_TABS[next].value)
        return
      }

      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[selectedIdx]) { e.preventDefault(); activate(filtered[selectedIdx]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, filtered, selectedIdx, activeTab, activate])

  // Scroll selected into view
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  if (!isOpen) return null

  const hasQuery = query.trim().length > 0

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-surface-border bg-surface-1 shadow-2xl flex flex-col overflow-hidden max-h-[76vh]">

        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border shrink-0">
          <Search className="h-5 w-5 text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search spools, brands, printers, actions, settings…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="rounded p-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center rounded border border-surface-border px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
              Esc
            </kbd>
          )}
        </div>

        {/* Filter tabs — only shown when searching */}
        {hasQuery && (
          <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 border-b border-surface-border shrink-0 scrollbar-none">
            {FILTER_TABS.map((tab) => {
              const count = counts[tab.value] ?? 0
              const active = activeTab === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-primary-600/20 text-primary-300'
                      : 'text-gray-500 hover:bg-surface-2 hover:text-gray-300',
                  )}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={cn(
                      'rounded-full px-1.5 py-px text-[10px] font-semibold',
                      active ? 'bg-primary-600/30 text-primary-300' : 'bg-surface-3 text-gray-500',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Body */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
          {!hasQuery ? (
            /* ── Home state ── */
            <div className="p-3 space-y-4">
              <div>
                <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Quick Jump
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_JUMPS.map((qj) => (
                    <button
                      key={qj.label}
                      onClick={() => {
                        setQuery(qj.query)
                        setActiveTab(qj.filter)
                        inputRef.current?.focus()
                      }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all hover:brightness-125',
                        qj.colorClass,
                      )}
                    >
                      {qj.icon}
                      {qj.label}
                    </button>
                  ))}
                </div>
              </div>

              {recents.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 pb-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Recent</p>
                    <button
                      onClick={clearRecent}
                      className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {recents.map((r) => (
                      <button
                        key={r}
                        onClick={() => setQuery(r)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-surface-2 hover:text-white transition-colors"
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="px-2 text-xs text-gray-600">
                Type to search across spools, brands, printers, history, actions and settings.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            /* ── No results ── */
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <Search className="h-8 w-8 text-gray-700" />
              <p className="text-sm text-gray-400">
                No results for <span className="text-white">"{query}"</span>
              </p>
              <p className="text-xs text-gray-600">Try a different search or switch tabs</p>
            </div>
          ) : (
            /* ── Results ── */
            <div className="py-1.5">
              {filtered.map((result, idx) => (
                <ResultRow
                  key={result.id}
                  result={result}
                  query={query}
                  isSelected={idx === selectedIdx}
                  dataIdx={idx}
                  onHover={() => setIdx(idx)}
                  onActivate={() => activate(result)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {hasQuery && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-surface-border px-4 py-2 text-[11px] text-gray-600 shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-border px-1 font-mono text-[10px]">↑</kbd>
                <kbd className="rounded border border-surface-border px-1 font-mono text-[10px]">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-border px-1 font-mono text-[10px]">↵</kbd>
                open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-surface-border px-1 font-mono text-[10px]">Tab</kbd>
                filter
              </span>
            </div>
            <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({
  result, query, isSelected, dataIdx, onHover, onActivate,
}: {
  result:     SearchResult
  query:      string
  isSelected: boolean
  dataIdx:    number
  onHover:    () => void
  onActivate: () => void
}) {
  return (
    <button
      data-idx={dataIdx}
      onClick={onActivate}
      onMouseEnter={onHover}
      className={cn(
        'group relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        isSelected ? 'bg-surface-2' : 'hover:bg-surface-2',
      )}
    >
      {/* Active indicator */}
      {isSelected && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary-500" />
      )}

      {/* Icon / color swatch */}
      {result.colorHex ? (
        <div
          className="h-8 w-8 shrink-0 rounded-lg border border-black/20"
          style={{ backgroundColor: result.colorHex }}
        />
      ) : (
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TYPE_COLOR[result.type])}>
          {TYPE_ICON[result.type]}
        </div>
      )}

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-white">
          <Highlight text={result.title} query={query} />
        </p>
        {result.subtitle && (
          <p className="truncate text-xs text-gray-500 mt-0.5">{result.subtitle}</p>
        )}
      </div>

      {/* Right side: type pill + enter hint */}
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn('rounded px-1.5 py-px text-[10px] font-medium capitalize', TYPE_COLOR[result.type])}>
          {result.type}
        </span>
        {isSelected && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-600">
            <CornerDownLeft className="h-3 w-3" />
            enter
          </span>
        )}
      </div>
    </button>
  )
}
