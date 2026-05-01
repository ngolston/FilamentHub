import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usersApi } from '@/api/users'
import { getRefreshToken } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

export interface GeneralPrefs {
  view_mode:        'grid' | 'table'
  date_range:       '7d' | '30d' | '90d' | 'all'
  sort_order:       'date_added' | 'fill_pct' | 'material' | 'brand'
  page_size:        12 | 24 | 48 | 96
  delete_confirm:   boolean
  auto_sync:        boolean
  low_stock_banner: boolean
  hotkeys:          boolean
}

const LS_KEY = 'fh_general'

export const GENERAL_DEFAULTS: GeneralPrefs = {
  view_mode:        'grid',
  date_range:       '30d',
  sort_order:       'date_added',
  page_size:        24,
  delete_confirm:   true,
  auto_sync:        true,
  low_stock_banner: true,
  hotkeys:          true,
}

/** Synchronous read — safe to use as useState initializer. */
export function getStoredGeneralPrefs(): GeneralPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? { ...GENERAL_DEFAULTS, ...JSON.parse(raw) } : GENERAL_DEFAULTS
  } catch {
    return GENERAL_DEFAULTS
  }
}

/** Persist a partial patch to localStorage. */
export function patchStoredGeneralPrefs(patch: Partial<GeneralPrefs>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...getStoredGeneralPrefs(), ...patch }))
  } catch {}
}

/**
 * Returns live general prefs. On first render uses localStorage (instant, no
 * flash). Syncs from the API in the background and keeps localStorage current.
 */
export function useGeneralPrefs(): GeneralPrefs {
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const [prefs, setPrefs] = useState<GeneralPrefs>(getStoredGeneralPrefs)

  const { data } = useQuery({
    queryKey: ['ui-prefs'],
    queryFn:  usersApi.getUiPrefs,
    select:   (d) => (d as { general?: GeneralPrefs }).general,
    enabled:  isInitialized && !!getRefreshToken(),
  })

  useEffect(() => {
    if (data) {
      const merged = { ...GENERAL_DEFAULTS, ...data }
      setPrefs(merged)
      try { localStorage.setItem(LS_KEY, JSON.stringify(merged)) } catch {}
    }
  }, [data])

  return prefs
}
