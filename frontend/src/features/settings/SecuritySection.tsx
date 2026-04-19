import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import {
  ShieldCheck, ShieldOff, Monitor, Smartphone,
  LogOut, Trash2, Globe, UserPlus,
} from 'lucide-react'
import { authApi } from '@/api/auth'
import { systemApi } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'
import { formatDistanceToNow } from 'date-fns'
import type { SessionResponse } from '@/types/api'

// ── Password change ────────────────────────────────────────────────────────────

const pwSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password:     z.string().min(8, 'Must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})
type PwForm = z.infer<typeof pwSchema>

function PasswordChangeCard() {
  const [success, setSuccess] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  })

  const mutation = useMutation({
    mutationFn: (d: PwForm) => authApi.changePassword(d.current_password, d.new_password),
    onSuccess: () => {
      reset()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    },
  })

  return (
    <SettingsCard title="Change password" description="Update the password used to sign in to your account.">
      {success && (
        <p className="rounded-lg bg-green-900/40 border border-green-700/50 px-3 py-2 text-sm text-green-300">
          Password updated successfully.
        </p>
      )}
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.current_password?.message}
          {...register('current_password')}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register('new_password')}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />
        {mutation.error && (
          <p className="text-sm text-red-400">{getErrorMessage(mutation.error)}</p>
        )}
        <Button type="submit" loading={mutation.isPending}>Update password</Button>
      </form>
    </SettingsCard>
  )
}

// ── Sessions ───────────────────────────────────────────────────────────────────

function deviceIcon(deviceName: string | null) {
  if (!deviceName) return <Globe className="h-4 w-4" />
  const d = deviceName.toLowerCase()
  if (d.includes('mobile') || d.includes('android') || d.includes('iphone'))
    return <Smartphone className="h-4 w-4" />
  return <Monitor className="h-4 w-4" />
}

function SessionRow({ session, onRevoke }: { session: SessionResponse; onRevoke: () => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
      session.is_current ? 'border-primary-700/40 bg-primary-900/10' : 'border-surface-border bg-surface-1'
    }`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-gray-400">
        {deviceIcon(session.device_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white truncate">
            {session.device_name ?? 'Unknown device'}
          </span>
          {session.is_current && (
            <span className="rounded-full bg-primary-600/20 px-2 py-px text-[10px] font-semibold text-primary-300">
              This device
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {session.ip_address && <span>{session.ip_address} · </span>}
          Active {formatDistanceToNow(new Date(session.last_used_at), { addSuffix: true })}
        </p>
      </div>
      {!session.is_current && (
        <button
          onClick={onRevoke}
          title="Revoke session"
          className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function SessionsCard() {
  const qc = useQueryClient()
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: authApi.listSessions,
  })

  const revokeMutation = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  const revokeAllMutation = useMutation({
    mutationFn: authApi.revokeAllSessions,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  return (
    <SettingsCard
      title="Active sessions"
      description="Devices currently signed in to your account. Remove any sessions you don't recognise."
    >
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-500">No active sessions found.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onRevoke={() => revokeMutation.mutate(s.id)}
            />
          ))}
        </div>
      )}

      {sessions.filter((s) => !s.is_current).length > 1 && (
        <Button
          variant="danger"
          size="sm"
          loading={revokeAllMutation.isPending}
          onClick={() => revokeAllMutation.mutate()}
          className="mt-2"
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Sign out all other sessions
        </Button>
      )}
    </SettingsCard>
  )
}

// ── 2FA card ───────────────────────────────────────────────────────────────────

const codeSchema = z.object({ code: z.string().length(6, 'Must be 6 digits').regex(/^\d+$/, 'Digits only') })
type CodeForm = z.infer<typeof codeSchema>

function TwoFactorCard() {
  const user    = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const [setupData,    setSetupData]    = useState<{ secret: string; uri: string } | null>(null)
  const [showDisable,  setShowDisable]  = useState(false)
  const [successMsg,   setSuccessMsg]   = useState('')

  const setupMutation = useMutation({
    mutationFn: authApi.totpSetup,
    onSuccess: (data) => setSetupData(data),
  })

  const enableForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })
  const enableMutation = useMutation({
    mutationFn: (data: CodeForm) => authApi.totpEnable(data.code),
    onSuccess: async () => {
      await fetchMe()
      setSetupData(null)
      setSuccessMsg('Two-factor authentication enabled.')
    },
  })

  const disableForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })
  const disableMutation = useMutation({
    mutationFn: (data: CodeForm) => authApi.totpDisable(data.code),
    onSuccess: async () => {
      await fetchMe()
      setShowDisable(false)
      setSuccessMsg('Two-factor authentication disabled.')
    },
  })

  const totpEnabled = user?.totp_enabled ?? false

  return (
    <SettingsCard title="Two-factor authentication" description="Add an extra layer of security to your account using an authenticator app.">
      {successMsg && (
        <p className="rounded-lg bg-green-900/40 border border-green-700/50 px-3 py-2 text-sm text-green-300">
          {successMsg}
        </p>
      )}

      {totpEnabled && !showDisable && (
        <div className="flex items-center justify-between rounded-lg border border-green-700/40 bg-green-900/20 px-4 py-3">
          <div className="flex items-center gap-2 text-green-300">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm font-medium">2FA is enabled</span>
          </div>
          <Button variant="secondary" onClick={() => { setShowDisable(true); setSuccessMsg('') }}>
            Disable
          </Button>
        </div>
      )}

      {totpEnabled && showDisable && (
        <form onSubmit={disableForm.handleSubmit((d) => disableMutation.mutate(d))} className="space-y-4">
          <div className="flex items-center gap-2 text-amber-300 text-sm">
            <ShieldOff className="h-4 w-4 shrink-0" />
            Enter your current authenticator code to disable 2FA.
          </div>
          <Input
            label="Authenticator code"
            placeholder="000000"
            maxLength={6}
            error={disableForm.formState.errors.code?.message}
            {...disableForm.register('code')}
          />
          {disableMutation.error && (
            <p className="text-sm text-red-400">{getErrorMessage(disableMutation.error)}</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowDisable(false)}>Cancel</Button>
            <Button type="submit" variant="danger" loading={disableMutation.isPending}>Disable 2FA</Button>
          </div>
        </form>
      )}

      {!totpEnabled && !setupData && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <ShieldOff className="h-4 w-4 shrink-0" />
            2FA is not enabled. Use an authenticator app like Google Authenticator or Authy.
          </div>
          {setupMutation.error && (
            <p className="text-sm text-red-400">{getErrorMessage(setupMutation.error)}</p>
          )}
          <Button onClick={() => setupMutation.mutate()} loading={setupMutation.isPending}>
            Set up 2FA
          </Button>
        </div>
      )}

      {setupData && (
        <div className="space-y-5">
          <p className="text-sm text-gray-300">
            Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-xl border border-surface-border bg-white p-3">
              <QRCodeSVG value={setupData.uri} size={160} />
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Manual entry key</p>
              <p className="break-all font-mono text-sm text-gray-300 select-all">{setupData.secret}</p>
            </div>
          </div>
          <form onSubmit={enableForm.handleSubmit((d) => enableMutation.mutate(d))} className="space-y-3">
            <Input
              label="Verification code"
              placeholder="000000"
              maxLength={6}
              error={enableForm.formState.errors.code?.message}
              {...enableForm.register('code')}
            />
            {enableMutation.error && (
              <p className="text-sm text-red-400">{getErrorMessage(enableMutation.error)}</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setSetupData(null)}>Cancel</Button>
              <Button type="submit" loading={enableMutation.isPending}>Verify &amp; enable</Button>
            </div>
          </form>
        </div>
      )}
    </SettingsCard>
  )
}

// ── Registration control (admin only) ─────────────────────────────────────────

function RegistrationCard() {
  const user = useAuthStore((s) => s.user)
  const qc   = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['system', 'public-config'],
    queryFn:  systemApi.getPublicConfig,
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: (allow: boolean) => systemApi.setAllowRegistration(allow),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['system', 'public-config'] }),
  })

  // Only admins see this card
  if (user?.role !== 'admin') return null

  const allowed = config?.allow_registration ?? true

  return (
    <SettingsCard
      title="User registration"
      description="Control whether new users can create accounts on this FilamentHub instance."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${allowed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-700/40 text-gray-500'}`}>
            <UserPlus className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {isLoading ? 'Loading…' : allowed ? 'Registration is open' : 'Registration is closed'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {allowed
                ? 'Anyone with the URL can sign up. Disable to make this a private instance.'
                : 'Only existing users can sign in. The "Create account" link is hidden on the login page.'}
            </p>
          </div>
        </div>
        <Toggle
          checked={allowed}
          onChange={(v) => mutation.mutate(v)}
          disabled={isLoading || mutation.isPending}
        />
      </div>
    </SettingsCard>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function SecuritySection() {
  return (
    <div className="space-y-6">
      <RegistrationCard />
      <PasswordChangeCard />
      <TwoFactorCard />
      <SessionsCard />
    </div>
  )
}
