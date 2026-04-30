import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Token storage (in-memory) ────────────────────────────────────────────────
// Access token lives only in memory; refresh token in sessionStorage so it
// survives a page reload without being accessible to XSS via document.cookie.

let _accessToken: string | null = null

export function getAccessToken() {
  return _accessToken
}

export function setTokens(accessToken: string, refreshToken: string) {
  _accessToken = accessToken
  sessionStorage.setItem('fh_refresh', refreshToken)
}

export function clearTokens() {
  _accessToken = null
  sessionStorage.removeItem('fh_refresh')
}

export function getRefreshToken() {
  return sessionStorage.getItem('fh_refresh')
}

// ─── Auto-refresh on 401 ──────────────────────────────────────────────────────

let _refreshPromise: Promise<string> | null = null

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true

      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        clearTokens()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      // Deduplicate concurrent refresh calls
      if (!_refreshPromise) {
        _refreshPromise = axios
          .post<{ access_token: string; refresh_token: string }>(
            `${BASE_URL}/api/v1/auth/refresh`,
            { refresh_token: refreshToken },
          )
          .then((res) => {
            setTokens(res.data.access_token, res.data.refresh_token)
            return res.data.access_token
          })
          .catch((err) => {
            clearTokens()
            window.location.href = '/login'
            return Promise.reject(err)
          })
          .finally(() => {
            _refreshPromise = null
          })
      }

      const newToken = await _refreshPromise
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    }

    return Promise.reject(error)
  },
)

// ─── Typed error helper ───────────────────────────────────────────────────────

export interface ApiError {
  detail: string | { msg: string; type: string }[]
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined
    if (!data) return error.message
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail)) return data.detail.map((e) => e.msg).join(', ')
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}
