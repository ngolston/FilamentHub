import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Flame, CheckCircle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [sent, setSent]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [serverError, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    try {
      await authApi.forgotPassword(data.email)
      setSent(true)
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
            <h1 className="text-2xl font-bold text-white">Reset your password</h1>
            <p className="mt-1 text-sm text-gray-400">
              {sent ? "Check your inbox" : "Enter your email and we'll send a reset link"}
            </p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-green-700/40 bg-green-900/20 px-4 py-6 text-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
              <p className="text-sm text-gray-300">
                If an account exists for that email, a password reset link has been sent.
                Check your inbox (and spam folder).
              </p>
            </div>
            <Link
              to="/login"
              className="block text-center text-sm text-primary-400 hover:text-primary-300"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            {serverError && (
              <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>

            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="text-primary-400 hover:text-primary-300">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
