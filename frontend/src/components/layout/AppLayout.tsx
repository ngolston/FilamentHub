import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { CommandPalette } from '@/features/search/CommandPalette'
import { OnboardingFlow, isOnboardingComplete } from '@/features/onboarding/OnboardingFlow'
import { cn } from '@/utils/cn'

const PAGE_TITLES: Record<string, string> = {
  '/':            'Dashboard',
  '/spools':      'Spool Inventory',
  '/printers':    'Devices',
  '/print-jobs':  'Print Jobs',
  '/filaments':   'Filament Profiles',
  '/community':   'Community Filament Database',
  '/qr-labels':   'QR Labels',
  '/alerts':      'Alerts',
  '/settings':    'Settings',
  '/reorder':     'Reorder List',
  '/analytics':   'Analytics',
}

export function AppLayout() {
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [paletteOpen,    setPaletteOpen]    = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete())
  const location = useLocation()
  const title    = PAGE_TITLES[location.pathname] ?? 'FilamentHub'

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

        {/* Top bar — desktop + mobile */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-surface-1 px-4">
          {/* Mobile: hamburger + page title */}
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-white truncate">{title}</span>
          </div>

          {/* Desktop: page title */}
          <span className="hidden lg:block text-sm font-semibold text-white">{title}</span>

          {/* Search trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-surface-border bg-surface-2',
              'px-3 py-1.5 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors',
              'lg:w-56',
            )}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:block flex-1 text-left text-xs">Search…</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-surface-border px-1 font-mono text-[10px] text-gray-600">
              ⌘K
            </kbd>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Command palette */}
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Onboarding flow — shown once for new users */}
      {showOnboarding && (
        <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
