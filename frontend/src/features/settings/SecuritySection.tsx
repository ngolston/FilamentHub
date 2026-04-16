import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'

const codeSchema = z.object({ code: z.string().length(6, 'Must be 6 digits').regex(/^\d+$/, 'Digits only') })
type CodeForm = z.infer<typeof codeSchema>

export function SecuritySection() {
  const user    = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null)
  const [showDisable, setShowDisable] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // ── Setup (start) ──────────────────────────────────────────────────────────
  const setupMutation = useMutation({
    mutationFn: authApi.totpSetup,
    onSuccess: (data) => setSetupData(data),
  })

  // ── Enable (verify QR) ─────────────────────────────────────────────────────
  const enableForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })
  const enableMutation = useMutation({
    mutationFn: (data: CodeForm) => authApi.totpEnable(data.code),
    onSuccess: async () => {
      await fetchMe()
      setSetupData(null)
      setSuccessMsg('Two-factor authentication enabled.')
    },
  })

  // ── Disable ────────────────────────────────────────────────────────────────
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

      {/* ── Enabled state ───────────────────────────────────────────────── */}
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

      {/* ── Disable form ────────────────────────────────────────────────── */}
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

      {/* ── Not enabled ─────────────────────────────────────────────────── */}
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

      {/* ── QR / verify step ────────────────────────────────────────────── */}
      {setupData && (
        <div className="space-y-5">
          <div className="space-y-1">
            <p className="text-sm text-gray-300">
              Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
            </p>
          </div>

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
