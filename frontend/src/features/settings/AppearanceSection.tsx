import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Moon, Sun, Contrast, CloudMoon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { applyTheme, type AppTheme } from '@/hooks/useTheme'
import { applyAccent, applyDensityAndFontSize, applyReduceMotion } from '@/hooks/useAppearance'
import { usersApi } from '@/api/users'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsCard } from './SettingsCard'

type Density  = 'compact' | 'default' | 'comfortable'
type FontSize = 'small' | 'medium' | 'large'

interface AppearancePrefs {
  theme:         AppTheme
  accent:        string
  accent_custom: string
  density:       Density
  font_size:     FontSize
  reduce_motion: boolean
}

const DEFAULTS: AppearancePrefs = {
  theme: 'theme-dark', accent: '#4f46e5', accent_custom: '',
  density: 'default', font_size: 'medium', reduce_motion: false,
}

const ACCENT_COLORS = [
  { name: 'Indigo',   value: '#4f46e5' },
  { name: 'Cyan',     value: '#0891b2' },
  { name: 'Emerald',  value: '#059669' },
  { name: 'Rose',     value: '#e11d48' },
  { name: 'Amber',    value: '#d97706' },
  { name: 'Violet',   value: '#7c3aed' },
  { name: 'Teal',     value: '#0f766e' },
  { name: 'Orange',   value: '#ea580c' },
]

const THEMES: {
  value: AppTheme
  label: string
  description: string
  icon: React.ReactNode
  preview: { bg: string; surface: string; primary: string }
}[] = [
  {
    value: 'theme-dark',
    label: 'Dark',
    description: 'Classic deep navy dark mode',
    icon: <Moon className="h-5 w-5" />,
    preview: { bg: '#0f1117', surface: '#1c2030', primary: '#4f46e5' },
  },
  {
    value: 'theme-soft-dark',
    label: 'Soft Dark',
    description: 'Softer slate tones, easier on the eyes',
    icon: <CloudMoon className="h-5 w-5" />,
    preview: { bg: '#111827', surface: '#374151', primary: '#6366f1' },
  },
  {
    value: 'theme-muted-dark',
    label: 'Muted Dark',
    description: 'Very deep background, lighter accents',
    icon: <Moon className="h-5 w-5" />,
    preview: { bg: '#0b0f14', surface: '#1a2333', primary: '#818cf8' },
  },
  {
    value: 'theme-high-contrast',
    label: 'High Contrast',
    description: 'Near-black base with sharper borders',
    icon: <Contrast className="h-5 w-5" />,
    preview: { bg: '#05070a', surface: '#1f2937', primary: '#6366f1' },
  },
  {
    value: 'theme-light',
    label: 'Light',
    description: 'Clean white interface',
    icon: <Sun className="h-5 w-5" />,
    preview: { bg: '#f1f5f9', surface: '#e2e8f0', primary: '#4f46e5' },
  },
]

function PillGroup<T extends string>({
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
            key={opt.value}
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

export function AppearanceSection() {
  const qc = useQueryClient()

  const { data: serverPrefs } = useQuery({
    queryKey: ['ui-prefs'],
    queryFn:  usersApi.getUiPrefs,
    select:   (d) => (d as { appearance?: AppearancePrefs }).appearance,
  })

  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULTS)

  useEffect(() => {
    if (serverPrefs) {
      setPrefs((p) => ({ ...p, ...serverPrefs }))
      if (serverPrefs.theme) {
        localStorage.setItem('fh_theme', JSON.stringify(serverPrefs.theme))
        applyTheme(serverPrefs.theme)
      }
      const effectiveAccent = serverPrefs.accent_custom?.match(/^#[0-9a-fA-F]{6}$/)
        ? serverPrefs.accent_custom
        : serverPrefs.accent
      if (effectiveAccent) applyAccent(effectiveAccent)
      applyDensityAndFontSize(serverPrefs.density ?? 'default', serverPrefs.font_size ?? 'medium')
      applyReduceMotion(serverPrefs.reduce_motion ?? false)
    }
  }, [serverPrefs])

  const saveMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => usersApi.updateUiPrefs({ appearance: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ui-prefs'] }),
  })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedSave = useCallback((patch: Partial<AppearancePrefs>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(
      () => saveMutation.mutate(patch as Record<string, unknown>),
      600,
    )
  }, [saveMutation])

  function set<K extends keyof AppearancePrefs>(key: K, val: AppearancePrefs[K]) {
    const updated = { ...prefs, [key]: val }
    setPrefs(updated)
    debouncedSave({ [key]: val })
  }

  function handleThemeChange(t: AppTheme) {
    // Write to localStorage immediately so useThemeApplier works on next page load
    localStorage.setItem('fh_theme', JSON.stringify(t))
    applyTheme(t)
    set('theme', t)
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <SettingsCard title="Theme" description="Choose your preferred colour scheme.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleThemeChange(t.value)}
              className={cn(
                'relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                prefs.theme === t.value
                  ? 'border-primary-500 bg-primary-600/10'
                  : 'border-surface-border bg-surface-2 hover:border-gray-500 cursor-pointer',
              )}
            >
              <div
                className="h-10 w-10 shrink-0 rounded-lg border border-black/20 overflow-hidden"
                style={{ background: t.preview.bg }}
              >
                <div className="h-4 mx-1 mt-1.5 rounded" style={{ background: t.preview.surface }} />
                <div className="h-2 w-6 mx-1 mt-1 rounded" style={{ background: t.preview.primary }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-sm font-medium leading-tight',
                  prefs.theme === t.value ? 'text-primary-300' : 'text-white',
                )}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{t.description}</p>
              </div>
              {prefs.theme === t.value && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary-500" />
              )}
            </button>
          ))}
        </div>
      </SettingsCard>

      {/* Accent colour */}
      <SettingsCard title="Accent colour" description="Highlight colour used for buttons, active states, and focus rings.">
        <div className="flex flex-wrap gap-3">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                applyAccent(c.value)
                setPrefs(p => ({ ...p, accent: c.value, accent_custom: '' }))
                debouncedSave({ accent: c.value, accent_custom: '' })
              }}
              title={c.name}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                prefs.accent === c.value && !prefs.accent_custom
                  ? 'border-white scale-110'
                  : 'border-transparent',
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 shrink-0 rounded-full border-2 border-surface-border"
            style={{ backgroundColor: prefs.accent_custom?.match(/^#[0-9a-fA-F]{6}$/) ? prefs.accent_custom : '#374151' }}
          />
          <input
            value={prefs.accent_custom}
            onChange={(e) => {
              const val = e.target.value
              if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                applyAccent(val)
                setPrefs(p => ({ ...p, accent: val, accent_custom: val }))
                debouncedSave({ accent: val, accent_custom: val })
              } else {
                setPrefs(p => ({ ...p, accent_custom: val }))
                debouncedSave({ accent_custom: val })
              }
            }}
            placeholder="Custom hex, e.g. #a855f7"
            className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
      </SettingsCard>

      {/* Density + Font size + Motion */}
      <SettingsCard title="Interface" description="Control spacing, text size, and animation.">
        <div className="space-y-5">
          <PillGroup<Density>
            label="Density"
            value={prefs.density}
            onChange={(v) => { applyDensityAndFontSize(v, prefs.font_size); set('density', v) }}
            options={[
              { value: 'compact',     label: 'Compact'     },
              { value: 'default',     label: 'Default'     },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
          <PillGroup<FontSize>
            label="Font size"
            value={prefs.font_size}
            onChange={(v) => { applyDensityAndFontSize(prefs.density, v); set('font_size', v) }}
            options={[
              { value: 'small',  label: 'Small'  },
              { value: 'medium', label: 'Medium' },
              { value: 'large',  label: 'Large'  },
            ]}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Reduce motion</p>
              <p className="text-xs text-gray-500 mt-0.5">Minimise animations throughout the interface.</p>
            </div>
            <Toggle checked={prefs.reduce_motion} onChange={(v) => { applyReduceMotion(v); set('reduce_motion', v) }} />
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
