import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Flame, CheckCircle, AlertTriangle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'

const schema = z.object({
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const [searchParams]          = useSearchParams()
  const navigate                = useNavigate()
  const token                   = searchParams.get('token')
  const [done, setDone]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [serverError, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      await authApi.resetPassword(token, data.password)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500">
            <Flame className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Set new password</h1>
            <p className="mt-1 text-sm text-gray-400">Choose a strong password for your account</p>
          </div>
        </div>

        {!token ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-4 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Invalid or missing reset token. Please request a new password reset link.
            </div>
            <Link to="/forgot-password" className="block text-center text-sm text-primary-400 hover:text-primary-300">
              Request new link
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-green-700/40 bg-green-900/20 px-4 py-6 text-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
              <p className="text-sm text-gray-300">
                Password updated. Redirecting to sign in…
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            {serverError && (
              <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
