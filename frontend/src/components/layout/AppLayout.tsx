import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { cn } from '@/utils/cn'

const PAGE_TITLES: Record<string, string> = {
  '/':            'Dashboard',
  '/spools':      'Spool Inventory',
  '/printers':    'Printers',
  '/ams':         'AMS Manager',
  '/print-jobs':  'Print Jobs',
  '/filaments':   'Filament Database',
  '/community':   'Community Database',
  '/drying':      'Drying Sessions',
  '/qr-labels':  'QR Labels',
  '/alerts':      'Alerts',
  '/settings':    'Settings',
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? 'FilamentHub'

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-50 animate-slide-in">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header bar */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-surface-border bg-surface-1 px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-base font-semibold text-white">{title}</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
