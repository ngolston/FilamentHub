import { useEffect } from 'react'

export type AppTheme =
  | 'theme-dark'
  | 'theme-soft-dark'
  | 'theme-muted-dark'
  | 'theme-high-contrast'
  | 'theme-light'

const THEME_CLASSES: AppTheme[] = [
  'theme-dark',
  'theme-soft-dark',
  'theme-muted-dark',
  'theme-high-contrast',
  'theme-light',
]

const STORAGE_KEY = 'fh_theme'

export function getStoredTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      // useLocalSetting stores values as JSON strings (e.g. '"theme-dark"')
      const parsed = JSON.parse(raw) as string
      if (THEME_CLASSES.includes(parsed as AppTheme)) {
        return parsed as AppTheme
      }
    }
  } catch {
    // ignore
  }
  return 'theme-dark'
}

export function applyTheme(theme: AppTheme) {
  const html = document.documentElement
  THEME_CLASSES.forEach((cls) => html.classList.remove(cls))
  html.classList.add(theme)
}

/** Applies the stored theme on first render. No return value — used in App. */
export function useThemeApplier() {
  useEffect(() => {
    applyTheme(getStoredTheme())

    // Listen for storage changes from other tabs
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        applyTheme(getStoredTheme())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
}
