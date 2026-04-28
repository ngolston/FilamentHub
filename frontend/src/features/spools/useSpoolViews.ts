import { useState, useCallback } from 'react'
import type { SortKey } from './SpoolTable'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ViewFilters {
  search:       string
  material:     string
  brandFilter:  string
  statusFlt:    string
  colorFlt:     string
  basicColorFlt: string
  locationFlt:  string
  printerFlt:   string
}

export interface SpoolView {
  id:        string
  name:      string
  builtIn?:  boolean          // built-in views cannot be deleted
  columns:   string[]
  filters:   ViewFilters
  sortBy:    SortKey
  sortDir:   'asc' | 'desc'
  viewMode:  'table' | 'grid'
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_COLUMNS = [
  'id', 'color', 'name', 'material', 'status', 'fill', 'remaining', 'printer', 'last_used',
]

const EMPTY_FILTERS: ViewFilters = {
  search: '', material: '', brandFilter: '', statusFlt: '',
  colorFlt: '', basicColorFlt: '', locationFlt: '', printerFlt: '',
}

export const BUILT_IN_VIEWS: SpoolView[] = [
  {
    id: 'all', name: 'All Spools', builtIn: true,
    columns: DEFAULT_COLUMNS,
    filters: EMPTY_FILTERS,
    sortBy: 'last_used', sortDir: 'desc', viewMode: 'table',
  },
  {
    id: 'active', name: 'Active', builtIn: true,
    columns: DEFAULT_COLUMNS,
    filters: { ...EMPTY_FILTERS, statusFlt: 'active' },
    sortBy: 'last_used', sortDir: 'desc', viewMode: 'table',
  },
  {
    id: 'low', name: 'Low Stock', builtIn: true,
    columns: DEFAULT_COLUMNS,
    filters: { ...EMPTY_FILTERS, statusFlt: 'active' },
    sortBy: 'fill_pct', sortDir: 'asc', viewMode: 'table',
  },
]

// ── Persistence ───────────────────────────────────────────────────────────────

const LS_VIEWS  = 'fh-spool-views'
const LS_ACTIVE = 'fh-spool-active-view'
const LS_COLS   = 'fh-spool-columns'

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback }
  catch { return fallback }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSpoolViews() {
  const [customViews, setCustomViews] = useState<SpoolView[]>(() => load(LS_VIEWS, []))
  const [activeId,    setActiveId]    = useState<string>(() => load(LS_ACTIVE, 'all'))

  const allViews = [...BUILT_IN_VIEWS, ...customViews]
  const activeView = allViews.find((v) => v.id === activeId) ?? BUILT_IN_VIEWS[0]

  const activateView = useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(LS_ACTIVE, JSON.stringify(id))
  }, [])

  const saveView = useCallback((view: SpoolView) => {
    setCustomViews((prev) => {
      const idx = prev.findIndex((v) => v.id === view.id)
      const next = idx >= 0 ? prev.map((v, i) => (i === idx ? view : v)) : [...prev, view]
      localStorage.setItem(LS_VIEWS, JSON.stringify(next))
      return next
    })
  }, [])

  const deleteView = useCallback((id: string) => {
    setCustomViews((prev) => {
      const next = prev.filter((v) => v.id !== id)
      localStorage.setItem(LS_VIEWS, JSON.stringify(next))
      return next
    })
    setActiveId((cur) => {
      const next = cur === id ? 'all' : cur
      localStorage.setItem(LS_ACTIVE, JSON.stringify(next))
      return next
    })
  }, [])

  const renameView = useCallback((id: string, name: string) => {
    setCustomViews((prev) => {
      const next = prev.map((v) => v.id === id ? { ...v, name } : v)
      localStorage.setItem(LS_VIEWS, JSON.stringify(next))
      return next
    })
  }, [])

  return { allViews, activeView, activeId, activateView, saveView, deleteView, renameView }
}

// ── Column visibility helper (separate from view, persisted independently) ───

export function loadColumns(): string[] { return load(LS_COLS, DEFAULT_COLUMNS) }
export function saveColumns(cols: string[]) { localStorage.setItem(LS_COLS, JSON.stringify(cols)) }
