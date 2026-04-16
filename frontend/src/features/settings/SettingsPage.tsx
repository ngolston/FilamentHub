import { useState } from 'react'
import {
  Bell, Database, Flame, Key, LayoutGrid,
  Palette, Settings2, ShieldCheck, Sliders, Trash2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { ProfileSection }      from './ProfileSection'
import { GeneralSection }      from './GeneralSection'
import { AppearanceSection }   from './AppearanceSection'
import { UnitsSection }        from './UnitsSection'
import { SecuritySection }     from './SecuritySection'
import { NotificationsSection } from './NotificationsSection'
import { IntegrationsSection } from './IntegrationsSection'
import { ApiWebhooksSection }  from './ApiWebhooksSection'
import { DataBackupSection }   from './DataBackupSection'
import { DangerZoneSection }   from './DangerZoneSection'

const SECTIONS = [
  { id: 'profile',      label: 'Profile',         icon: Flame,        component: ProfileSection      },
  { id: 'general',      label: 'General',          icon: Settings2,    component: GeneralSection      },
  { id: 'appearance',   label: 'Appearance',       icon: Palette,      component: AppearanceSection   },
  { id: 'units',        label: 'Units & Format',   icon: Sliders,      component: UnitsSection        },
  { id: 'security',     label: 'Security',         icon: ShieldCheck,  component: SecuritySection     },
  { id: 'notifications',label: 'Notifications',    icon: Bell,         component: NotificationsSection },
  { id: 'integrations', label: 'Integrations',     icon: LayoutGrid,   component: IntegrationsSection },
  { id: 'api',          label: 'API & Webhooks',   icon: Key,          component: ApiWebhooksSection  },
  { id: 'data',         label: 'Data & Backup',    icon: Database,     component: DataBackupSection   },
  { id: 'danger',       label: 'Danger Zone',      icon: Trash2,       component: DangerZoneSection,  danger: true },
] as const

type SectionId = typeof SECTIONS[number]['id']

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>('profile')

  const Section = SECTIONS.find((s) => s.id === active)?.component ?? ProfileSection

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <nav className="hidden lg:flex flex-col w-52 shrink-0 border-r border-surface-border py-6 px-3 gap-0.5">
        <p className="px-3 mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Settings
        </p>
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const isDanger = 'danger' in s && s.danger
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left w-full',
                active === s.id
                  ? isDanger
                    ? 'bg-red-900/30 text-red-300'
                    : 'bg-primary-600/20 text-white'
                  : isDanger
                  ? 'text-red-400/70 hover:bg-red-900/20 hover:text-red-300'
                  : 'text-gray-400 hover:bg-surface-2 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {s.label}
            </button>
          )
        })}
      </nav>

      {/* ── Mobile tab bar ──────────────────────────────────────────── */}
      <div className="lg:hidden border-b border-surface-border px-4 pt-4 pb-0 overflow-x-auto flex gap-1 shrink-0 w-full">
        {SECTIONS.map((s) => {
          const isDanger = 'danger' in s && s.danger
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                'shrink-0 rounded-t-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2',
                active === s.id
                  ? isDanger
                    ? 'border-red-500 text-red-300'
                    : 'border-primary-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300',
              )}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-5 lg:p-8 max-w-2xl">
        <Section />
      </main>
    </div>
  )
}
