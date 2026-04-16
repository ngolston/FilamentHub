import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useLocalSetting } from '@/hooks/useLocalSetting'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsCard } from './SettingsCard'

type Theme    = 'dark' | 'light' | 'system'
type Density  = 'compact' | 'default' | 'comfortable'
type FontSize = 'small' | 'medium' | 'large'

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

function PillGroup<T extends string>({
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
  const [theme,        setTheme]        = useLocalSetting<Theme>('fh_theme', 'dark')
  const [accentColor,  setAccentColor]  = useLocalSetting('fh_accent', '#4f46e5')
  const [customHex,    setCustomHex]    = useLocalSetting('fh_accent_custom', '')
  const [density,      setDensity]      = useLocalSetting<Density>('fh_density', 'default')
  const [fontSize,     setFontSize]     = useLocalSetting<FontSize>('fh_font_size', 'medium')
  const [reduceMotion, setReduceMotion] = useLocalSetting('fh_reduce_motion', false)

  const themes: { value: Theme; label: string; icon: React.ReactNode; soon?: boolean }[] = [
    { value: 'dark',   label: 'Dark',   icon: <Moon className="h-5 w-5"    /> },
    { value: 'light',  label: 'Light',  icon: <Sun className="h-5 w-5"     />, soon: true },
    { value: 'system', label: 'System', icon: <Monitor className="h-5 w-5" />, soon: true },
  ]

  return (
    <div className="space-y-6">
      {/* Theme */}
      <SettingsCard title="Theme" description="Choose your preferred colour scheme.">
        <div className="grid grid-cols-3 gap-3">
          {themes.map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={t.soon}
              onClick={() => !t.soon && setTheme(t.value)}
              className={cn(
                'relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                theme === t.value && !t.soon
                  ? 'border-primary-500 bg-primary-600/10 text-white'
                  : 'border-surface-border bg-surface-2 text-gray-400',
                t.soon
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:border-gray-500 hover:text-white cursor-pointer',
              )}
            >
              {t.icon}
              <span className="text-sm font-medium">{t.label}</span>
              {t.soon && (
                <span className="absolute top-2 right-2 rounded text-[9px] font-semibold uppercase tracking-wide bg-surface-3 text-gray-400 px-1.5 py-0.5">
                  Soon
                </span>
              )}
              {theme === t.value && !t.soon && (
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
              onClick={() => { setAccentColor(c.value); setCustomHex('') }}
              title={c.name}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                accentColor === c.value && !customHex
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
            style={{ backgroundColor: customHex?.match(/^#[0-9a-fA-F]{6}$/) ? customHex : '#374151' }}
          />
          <input
            value={customHex}
            onChange={(e) => {
              setCustomHex(e.target.value)
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setAccentColor(e.target.value)
            }}
            placeholder="Custom hex, e.g. #a855f7"
            className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
        <p className="text-xs text-gray-500">
          Accent colour changes are visual preferences and will be applied in a future update.
        </p>
      </SettingsCard>

      {/* Density + Font size + Motion */}
      <SettingsCard title="Interface" description="Control spacing, text size, and animation.">
        <div className="space-y-5">
          <PillGroup<Density>
            label="Density"
            value={density}
            onChange={setDensity}
            options={[
              { value: 'compact',     label: 'Compact'     },
              { value: 'default',     label: 'Default'     },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
          <PillGroup<FontSize>
            label="Font size"
            value={fontSize}
            onChange={setFontSize}
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
            <Toggle checked={reduceMotion} onChange={setReduceMotion} />
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
