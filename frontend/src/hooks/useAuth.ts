import { useAuthStore } from '@/stores/auth'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const logout = useAuthStore((s) => s.logout)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const isAuthenticated = user !== null
  const isEditor = user?.role === 'editor' || user?.role === 'admin'
  const isAdmin = user?.role === 'admin'

  return { user, isLoading, isAuthenticated, isEditor, isAdmin, login, register, logout, fetchMe }
}
