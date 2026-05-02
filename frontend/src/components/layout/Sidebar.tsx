import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/utils/cn'
import { useAuth } from '@/hooks/useAuth'
import { adminApi } from '@/api/admin'
import {
  LayoutDashboard,
  Package,
  Printer,
  ClipboardList,
  Database,
  Globe,
  Flame,
  QrCode,
  Bell,
  Settings,
  LogOut,
  ShoppingCart,
  BarChart3,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',             label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/spools',       label: 'Spools',     icon: Package },
  { to: '/printers',     label: 'Devices',           icon: Printer },
  { to: '/print-jobs',   label: 'Print Jobs',        icon: ClipboardList },
  { to: '/filaments',    label: 'Filament Profiles', icon: Database },
  { to: '/community',    label: 'Community Filament Database', icon: Globe },
  { to: '/analytics',    label: 'Analytics',    icon: BarChart3 },
  { to: '/reorder',      label: 'Reorder List', icon: ShoppingCart },
  { to: '/qr-labels',   label: 'QR Labels',  icon: QrCode },
  { to: '/alerts',       label: 'Alerts',     icon: Bell },
  { to: '/settings',     label: 'Settings',   icon: Settings },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { user, logout } = useAuth()

  const { data: pendingData } = useQuery({
    queryKey: ['admin', 'pending-count'],
    queryFn: adminApi.pendingCount,
    enabled: user?.role === 'admin',
    refetchInterval: 60_000,
  })
  const pendingCount = pendingData?.count ?? 0

  return (
    <aside className="flex h-full w-60 flex-col bg-surface-1 border-r border-surface-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-surface-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-accent-500">
          <Flame className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-white tracking-tight">FilamentHub</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600/20 text-primary-300'
                  : 'text-gray-400 hover:bg-surface-2 hover:text-gray-200',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
            {to === '/settings' && pendingCount > 0 && (
              <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-surface-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-semibold text-white">
            {user?.display_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.display_name}</p>
            <p className="truncate text-xs text-gray-500">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="ml-auto rounded-md p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
