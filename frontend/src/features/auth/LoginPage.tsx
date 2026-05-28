import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { systemApi } from '@/api/system'

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem('fh_remember') === 'true'
  )

  const { data: publicConfig } = useQuery({
    queryKey: ['system', 'public-config'],
    queryFn: systemApi.getPublicConfig,
    staleTime: Infinity,   // rarely changes; don't refetch on every visit
  })
  const allowRegistration = publicConfig?.allow_registration ?? true

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      await login(data, rememberMe)
      const redirect = searchParams.get('redirect')
      navigate(redirect ?? '/', { replace: true })
    } catch (err) {
      setServerError(getErrorMessage(err))
    }
  }

  function handleRememberMe(checked: boolean) {
    setRememberMe(checked)
    localStorage.setItem('fh_remember', String(checked))
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
            <h1 className="text-2xl font-bold text-white">FilamentHub</h1>
            <p className="mt-1 text-sm text-gray-400">Sign in to your account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <div className="space-y-1">
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs text-gray-500 hover:text-primary-400 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {/* Remember me */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => handleRememberMe(e.target.checked)}
                className="peer sr-only"
              />
              <div className={`
                h-4 w-4 rounded border transition-colors flex items-center justify-center
                ${rememberMe
                  ? 'bg-primary-600 border-primary-600'
                  : 'bg-surface-2 border-surface-border group-hover:border-gray-500'}
              `}>
                {rememberMe && (
                  <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
              Remember me
            </span>
          </label>

          {serverError && (
            <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" loading={isLoading}>
            Sign in
          </Button>
        </form>

        {allowRegistration && (
          <p className="mt-6 text-center text-sm text-gray-500">
            No account?{' '}
            <Link to="/register" className="font-medium text-primary-400 hover:text-primary-300">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
