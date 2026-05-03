import { useState } from 'react'
import {
  Bell, Database, Flame, Key, LayoutGrid,
  Palette, Settings2, ShieldCheck, Sliders, Trash2, Users,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores/auth'
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
import { UsersSection }        from './UsersSection'

const BASE_SECTIONS = [
  { id: 'profile',      label: 'Profile',         icon: Flame,        component: ProfileSection,      danger: false },
  { id: 'general',      label: 'General',          icon: Settings2,    component: GeneralSection,      danger: false },
  { id: 'appearance',   label: 'Appearance',       icon: Palette,      component: AppearanceSection,   danger: false },
  { id: 'units',        label: 'Units & Format',   icon: Sliders,      component: UnitsSection,        danger: false },
  { id: 'security',     label: 'Security',         icon: ShieldCheck,  component: SecuritySection,     danger: false },
  { id: 'notifications',label: 'Notifications',    icon: Bell,         component: NotificationsSection,danger: false },
  { id: 'integrations', label: 'Integrations',     icon: LayoutGrid,   component: IntegrationsSection, danger: false },
  { id: 'api',          label: 'API & Webhooks',   icon: Key,          component: ApiWebhooksSection,  danger: false },
  { id: 'data',         label: 'Data & Backup',    icon: Database,     component: DataBackupSection,   danger: false },
  { id: 'danger',       label: 'Danger Zone',      icon: Trash2,       component: DangerZoneSection,   danger: true  },
]

const USERS_SECTION = { id: 'users', label: 'Users', icon: Users, component: UsersSection, danger: false }

type SectionId = typeof BASE_SECTIONS[number]['id'] | 'users'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const [active, setActive] = useState<SectionId>('profile')

  // Insert Users section after Security (index 4) for admins
  const sections = user?.role === 'admin'
    ? [...BASE_SECTIONS.slice(0, 5), USERS_SECTION, ...BASE_SECTIONS.slice(5)]
    : BASE_SECTIONS

  const Section = sections.find((s) => s.id === active)?.component ?? ProfileSection

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <nav className="hidden lg:flex flex-col w-52 shrink-0 border-r border-surface-border py-6 px-3 gap-0.5">
        <p className="px-3 mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Settings
        </p>
        {sections.map((s) => {
          const Icon = s.icon
          const isDanger = s.danger
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id as SectionId)}
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
        {sections.map((s) => {
          const isDanger = s.danger
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id as SectionId)}
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
