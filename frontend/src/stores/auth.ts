import { create } from 'zustand'
import { authApi } from '@/api/auth'
import { setTokens, clearTokens, getRefreshToken } from '@/api/client'
import type { UserResponse, UserLogin, UserRegister } from '@/types/api'

interface AuthState {
  user: UserResponse | null
  isLoading: boolean
  isInitialized: boolean

  login: (credentials: UserLogin) => Promise<void>
  register: (data: UserRegister) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  login: async (credentials) => {
    set({ isLoading: true })
    try {
      const tokens = await authApi.login(credentials)
      setTokens(tokens.access_token, tokens.refresh_token)
      const user = await authApi.me()
      set({ user, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  register: async (data) => {
    set({ isLoading: true })
    try {
      await authApi.register(data)
      // Auto-login after registration
      const tokens = await authApi.login({ email: data.email, password: data.password })
      setTokens(tokens.access_token, tokens.refresh_token)
      const user = await authApi.me()
      set({ user, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: () => {
    clearTokens()
    set({ user: null })
  },

  fetchMe: async () => {
    const user = await authApi.me()
    set({ user })
  },

  // Called once on app mount — restores session from stored refresh token
  initialize: async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      set({ isInitialized: true })
      return
    }
    try {
      const { authApi: _authApi } = await import('@/api/auth')
      const tokens = await _authApi.refresh(refreshToken)
      setTokens(tokens.access_token, tokens.refresh_token)
      const user = await authApi.me()
      set({ user, isInitialized: true })
    } catch {
      clearTokens()
      set({ isInitialized: true })
    }
  },
}))
