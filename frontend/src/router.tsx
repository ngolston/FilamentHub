import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuthStore } from '@/stores/auth'
import { FullPageSpinner } from '@/components/ui/Spinner'

// Lazy-loaded pages
import { lazy, Suspense } from 'react'

const LoginPage    = lazy(() => import('@/features/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'))
const DashboardPage   = lazy(() => import('@/features/dashboard/DashboardPage'))
const SpoolsPage      = lazy(() => import('@/features/spools/SpoolsPage'))
const AddSpoolPage    = lazy(() => import('@/features/spools/AddSpoolPage'))
const EditSpoolPage   = lazy(() => import('@/features/spools/EditSpoolPage'))
const PrintersPage    = lazy(() => import('@/features/printers/PrintersPage'))
const PrintJobsPage   = lazy(() => import('@/features/print-jobs/PrintJobsPage'))
const FilamentsPage   = lazy(() => import('@/features/filaments/FilamentsPage'))
const CommunityPage   = lazy(() => import('@/features/community/CommunityPage'))
const DryingPage      = lazy(() => import('@/features/drying/DryingPage'))
const AlertsPage      = lazy(() => import('@/features/alerts/AlertsPage'))
const QrLabelsPage    = lazy(() => import('@/features/qr-labels/QrLabelsPage'))
const SettingsPage    = lazy(() => import('@/features/settings/SettingsPage'))

function RequireAuth() {
  const { user, isInitialized } = useAuthStore()
  if (!isInitialized) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Outlet />
    </Suspense>
  )
}

function RequireGuest() {
  const { user, isInitialized } = useAuthStore()
  if (!isInitialized) return <FullPageSpinner />
  if (user) return <Navigate to="/" replace />
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Outlet />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [
      { path: '/login',    element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/',            element: <DashboardPage /> },
          { path: '/spools',      element: <SpoolsPage /> },
          { path: '/spools/new',       element: <AddSpoolPage /> },
          { path: '/spools/:id/edit', element: <EditSpoolPage /> },
          { path: '/printers',    element: <PrintersPage /> },
          { path: '/print-jobs',  element: <PrintJobsPage /> },
          { path: '/filaments',   element: <FilamentsPage /> },
          { path: '/community',   element: <CommunityPage /> },
          { path: '/drying',      element: <DryingPage /> },
          { path: '/alerts',      element: <AlertsPage /> },
          { path: '/qr-labels',   element: <QrLabelsPage /> },
          { path: '/settings',    element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
