import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Flame, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { getErrorMessage } from '@/api/client'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('No verification token found in the URL.')
      return
    }
    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error')
        setError(getErrorMessage(err))
      })
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500">
            <Flame className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Email verification</h1>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Verifying your email…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-green-700/40 bg-green-900/20 px-4 py-6 text-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
              <div>
                <p className="text-sm font-medium text-white">Email verified!</p>
                <p className="mt-1 text-sm text-gray-400">Your account is confirmed. You can now sign in.</p>
              </div>
            </div>
            <Link
              to="/login"
              className="block text-center text-sm font-medium text-primary-400 hover:text-primary-300"
            >
              Go to sign in →
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Verification failed</p>
                <p className="mt-0.5 text-xs text-red-400">{error ?? 'The link may have expired or already been used.'}</p>
              </div>
            </div>
            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="text-primary-400 hover:text-primary-300">
                Sign in
              </Link>
              {' '}and request a new verification email from Settings.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
