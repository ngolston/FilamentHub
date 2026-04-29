import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import { useThemeApplier } from './hooks/useTheme'
import { useAppearanceApplier } from './hooks/useAppearance'
import { getStoredGeneralPrefs, useGeneralPrefs } from './hooks/useGeneralPrefs'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: getStoredGeneralPrefs().auto_sync,
    },
  },
})

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize)
  useEffect(() => {
    initialize()
  }, [initialize])
  return <>{children}</>
}

function ThemeApplier() {
  useThemeApplier()
  useAppearanceApplier()
  return null
}

function AutoSyncController() {
  const { auto_sync } = useGeneralPrefs()
  useEffect(() => {
    queryClient.setDefaultOptions({
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: auto_sync },
    })
  }, [auto_sync])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeApplier />
      <AutoSyncController />
      <AuthInitializer>
        <RouterProvider router={router} />
      </AuthInitializer>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
