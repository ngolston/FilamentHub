import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, ExternalLink, RefreshCw, Send, Unplug } from 'lucide-react'
import { usersApi } from '@/api/users'
import { systemApi } from '@/api/system'
import { integrationsApi } from '@/api/integrations'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'

// ── Discord ────────────────────────────────────────────────────────────────────

function DiscordCard() {
  const user    = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const qc      = useQueryClient()

  const existing = user?.discord_webhook_url ?? ''
  const [open,    setOpen]    = useState(false)
  const [url,     setUrl]     = useState(existing)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: (webhookUrl: string | null) =>
      usersApi.updateMe({ discord_webhook_url: webhookUrl }),
    onSuccess: async () => {
      await fetchMe()
      qc.invalidateQueries({ queryKey: ['me'] })
      setOpen(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  const connected = !!user?.discord_webhook_url

  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🟣</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">Discord</p>
              {connected
                ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3 w-3" />Connected</span>
                : <span className="flex items-center gap-1 text-xs text-gray-500"><Circle className="h-3 w-3" />Not connected</span>
              }
            </div>
            <p className="text-xs text-gray-400 mt-0.5 max-w-sm">
              Post filament runout alerts to a Discord channel via webhook.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connected && !open && (
            <Button variant="danger" size="sm" loading={mutation.isPending} onClick={() => mutation.mutate(null)}>
              Disconnect
            </Button>
          )}
          {!connected && !open && (
            <Button variant="secondary" size="sm" onClick={() => { setUrl(''); setOpen(true) }}>
              Configure
            </Button>
          )}
          {connected && !open && (
            <Button variant="secondary" size="sm" onClick={() => { setUrl(existing); setOpen(true) }}>
              Edit
            </Button>
          )}
          {open && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          )}
        </div>
      </div>

      {success && (
        <p className="mt-3 text-xs text-green-400">Discord webhook saved.</p>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <Input
            label="Webhook URL"
            placeholder="https://discord.com/api/webhooks/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {mutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(mutation.error)}</p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              loading={mutation.isPending}
              disabled={!url.trim()}
              onClick={() => mutation.mutate(url.trim())}
            >
              Save webhook
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Coming-soon card ───────────────────────────────────────────────────────────

function SoonCard({
  logo, name, description, docsUrl,
}: {
  logo: string; name: string; description: string; docsUrl?: string
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5 opacity-60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{logo}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">{name}</p>
              <span className="rounded text-[9px] font-bold uppercase tracking-wide bg-surface-3 text-gray-400 px-1.5 py-0.5">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 max-w-sm">{description}</p>
          </div>
        </div>
        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 shrink-0"
          >
            Docs <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}

// ── SMTP ──────────────────────────────────────────────────────────────────────

function SmtpCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['smtp-config'],
    queryFn:  systemApi.getSmtp,
  })

  const [host,     setHost]     = useState('')
  const [port,     setPort]     = useState('587')
  const [user,     setUser]     = useState('')
  const [password, setPassword] = useState('')
  const [from,     setFrom]     = useState('')
  const [tls,      setTls]      = useState(true)

  function openForm() {
    if (cfg) {
      setHost(cfg.smtp_host ?? '')
      setPort(String(cfg.smtp_port ?? 587))
      setUser(cfg.smtp_user ?? '')
      setPassword('')   // never pre-fill password
      setFrom(cfg.smtp_from ?? '')
      setTls(cfg.smtp_tls)
    }
    setTestMsg(null)
    setOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => systemApi.updateSmtp({
      smtp_host:     host.trim() || null,
      smtp_port:     parseInt(port) || 587,
      smtp_user:     user.trim() || null,
      smtp_password: password || undefined,  // omit = keep existing
      smtp_from:     from.trim() || null,
      smtp_tls:      tls,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smtp-config'] })
      setOpen(false)
    },
  })

  const testMutation = useMutation({
    mutationFn: systemApi.testSmtp,
    onSuccess: (data) => setTestMsg({ ok: true, msg: `Test email sent to ${data.sent_to}` }),
    onError:   (err)  => setTestMsg({ ok: false, msg: getErrorMessage(err) }),
  })

  const configured = cfg?.configured ?? false

  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✉️</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">SMTP / Email</p>
              {isLoading ? null : configured
                ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3 w-3" />Configured</span>
                : <span className="flex items-center gap-1 text-xs text-gray-500"><Circle className="h-3 w-3" />Not configured</span>
              }
            </div>
            <p className="text-xs text-gray-400 mt-0.5 max-w-sm">
              Send alert notifications, password resets, and verification emails via your own SMTP server.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!open && (
            <Button variant="secondary" size="sm" onClick={openForm}>
              {configured ? 'Edit' : 'Configure'}
            </Button>
          )}
          {open && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="SMTP host"
              placeholder="smtp.gmail.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <Input
              label="Port"
              type="number"
              placeholder="587"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
            <Input
              label="Username"
              placeholder="you@example.com"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              placeholder={configured ? '(unchanged)' : 'App password or SMTP password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="From address"
              placeholder="noreply@yourdomain.com"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Encryption</label>
              <select
                value={tls ? 'tls' : 'none'}
                onChange={(e) => setTls(e.target.value === 'tls')}
                className="rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
              >
                <option value="tls">STARTTLS (recommended)</option>
                <option value="none">None / plaintext</option>
              </select>
            </div>
          </div>

          {testMsg && (
            <p className={`text-xs ${testMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {testMsg.msg}
            </p>
          )}
          {saveMutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(saveMutation.error)}</p>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={testMutation.isPending}
              disabled={!host.trim()}
              onClick={() => { setTestMsg(null); testMutation.mutate() }}
            >
              <Send className="h-3.5 w-3.5" /> Send test email
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bambu Cloud ───────────────────────────────────────────────────────────────

type BambuStep = 'idle' | 'credentials' | 'tfa'

function BambuCard() {
  const qc = useQueryClient()
  const [step,     setStep]     = useState<BambuStep>('idle')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [tfaCode,  setTfaCode]  = useState('')
  const [syncMsg,  setSyncMsg]  = useState<string | null>(null)

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['bambu-config'],
    queryFn:  integrationsApi.getBambu,
  })

  const connected = cfg?.connected ?? false

  function openForm() { setStep('credentials'); setEmail(''); setPassword(''); setTfaCode('') }
  function cancel()   { setStep('idle'); setEmail(''); setPassword(''); setTfaCode('') }

  const connectMutation = useMutation({
    mutationFn: () => integrationsApi.connectBambu(email.trim(), password),
    onSuccess: (data) => {
      if (data.tfa_required) {
        setPassword('')       // clear password immediately
        setStep('tfa')
      } else {
        qc.invalidateQueries({ queryKey: ['bambu-config'] })
        cancel()
      }
    },
  })

  const tfaMutation = useMutation({
    mutationFn: () => integrationsApi.verify2fa(tfaCode.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bambu-config'] })
      cancel()
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: integrationsApi.disconnectBambu,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bambu-config'] }),
  })

  const syncMutation = useMutation({
    mutationFn: integrationsApi.syncBambu,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bambu-config', 'printers'] })
      setSyncMsg(`Sync complete — ${data.created} added, ${data.updated} updated, ${data.unchanged} unchanged`)
      setTimeout(() => setSyncMsg(null), 5000)
    },
    onError: (err) => setSyncMsg(getErrorMessage(err)),
  })

  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🟢</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">Bambu Cloud</p>
              {isLoading ? null : connected
                ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3 w-3" />Connected{cfg?.username ? ` · ${cfg.username}` : ''}</span>
                : <span className="flex items-center gap-1 text-xs text-gray-500"><Circle className="h-3 w-3" />Not connected</span>
              }
              {connected && cfg!.printer_count > 0 && (
                <span className="text-xs text-gray-500">· {cfg!.printer_count} printer{cfg!.printer_count !== 1 ? 's' : ''}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 max-w-sm">
              Sync your Bambu Lab printers and AMS slot data from your cloud account.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connected && step === 'idle' && (
            <>
              <Button variant="secondary" size="sm" loading={syncMutation.isPending}
                onClick={() => { setSyncMsg(null); syncMutation.mutate() }}>
                <RefreshCw className="h-3.5 w-3.5" /> Sync
              </Button>
              <Button variant="danger" size="sm" loading={disconnectMutation.isPending}
                onClick={() => disconnectMutation.mutate()}>
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            </>
          )}
          {!connected && step === 'idle' && (
            <Button variant="secondary" size="sm" onClick={openForm}>Connect</Button>
          )}
          {step !== 'idle' && (
            <Button variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
          )}
        </div>
      </div>

      {syncMsg && (
        <p className={`mt-2 text-xs ${syncMutation.isError ? 'text-red-400' : 'text-green-400'}`}>
          {syncMsg}
        </p>
      )}

      {/* Step 1 — credentials */}
      {step === 'credentials' && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <p className="text-xs text-gray-400">
            Your password is used only to obtain an access token and is never stored.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Password" type="password" placeholder="Bambu account password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {connectMutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(connectMutation.error)}</p>
          )}
          <div className="flex justify-end">
            <Button size="sm" loading={connectMutation.isPending}
              disabled={!email.trim() || !password}
              onClick={() => connectMutation.mutate()}>
              Connect
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 — 2FA code */}
      {step === 'tfa' && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <div>
            <p className="text-sm font-medium text-white">Two-factor verification</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Bambu has sent a verification code to <span className="text-gray-300">{email}</span>.
              Enter it below to complete sign-in.
            </p>
          </div>
          <Input
            label="Verification code"
            placeholder="123456"
            value={tfaCode}
            onChange={(e) => setTfaCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tfaCode.trim() && tfaMutation.mutate()}
          />
          {tfaMutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(tfaMutation.error)}</p>
          )}
          <div className="flex justify-end">
            <Button size="sm" loading={tfaMutation.isPending}
              disabled={!tfaCode.trim()}
              onClick={() => tfaMutation.mutate()}>
              Verify
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Home Assistant ─────────────────────────────────────────────────────────────

function HomeAssistantCard() {
  const qc = useQueryClient()
  const [open,    setOpen]    = useState(false)
  const [haUrl,   setHaUrl]   = useState('')
  const [token,   setToken]   = useState('')
  const [testMsg, setTestMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['ha-config'],
    queryFn:  integrationsApi.getHa,
  })

  const connected = cfg?.connected ?? false

  function openForm() {
    setHaUrl(cfg?.url ?? '')
    setToken('')   // never pre-fill token
    setTestMsg(null)
    setOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => integrationsApi.saveHa(haUrl.trim(), token.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ha-config'] })
      setOpen(false)
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: integrationsApi.disconnectHa,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ha-config'] }),
  })

  const testMutation = useMutation({
    mutationFn: integrationsApi.testHa,
    onSuccess: (data) => setTestMsg({ ok: true, msg: `Connected — Home Assistant ${data.ha_version}` }),
    onError:   (err)  => setTestMsg({ ok: false, msg: getErrorMessage(err) }),
  })

  const syncMutation = useMutation({
    mutationFn: integrationsApi.syncHa,
    onSuccess: (data) => {
      setSyncMsg(`Pushed ${data.pushed}/${data.total} sensors${data.errors > 0 ? ` (${data.errors} errors)` : ''}`)
      setTimeout(() => setSyncMsg(null), 5000)
    },
    onError: (err) => setSyncMsg(getErrorMessage(err)),
  })

  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏠</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">Home Assistant</p>
              {isLoading ? null : connected
                ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3 w-3" />Connected</span>
                : <span className="flex items-center gap-1 text-xs text-gray-500"><Circle className="h-3 w-3" />Not connected</span>
              }
            </div>
            <p className="text-xs text-gray-400 mt-0.5 max-w-sm">
              Push spool fill levels and status as sensor entities to your Home Assistant instance.
            </p>
            {connected && cfg?.url && (
              <p className="text-xs font-mono text-gray-500 mt-0.5 truncate max-w-xs">{cfg.url}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connected && (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={syncMutation.isPending}
                onClick={() => { setSyncMsg(null); syncMutation.mutate() }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Push sensors
              </Button>
              <Button variant="secondary" size="sm" onClick={openForm}>Edit</Button>
              <Button
                variant="danger"
                size="sm"
                loading={disconnectMutation.isPending}
                onClick={() => disconnectMutation.mutate()}
              >
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            </>
          )}
          {!connected && !open && (
            <Button variant="secondary" size="sm" onClick={openForm}>Configure</Button>
          )}
          {open && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          )}
        </div>
      </div>

      {syncMsg && (
        <p className={`mt-2 text-xs ${syncMutation.isError ? 'text-red-400' : 'text-green-400'}`}>
          {syncMsg}
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <p className="text-xs text-gray-400">
            Enter your Home Assistant URL and a long-lived access token from your HA profile page.
          </p>
          <Input
            label="Home Assistant URL"
            placeholder="http://homeassistant.local:8123"
            value={haUrl}
            onChange={(e) => setHaUrl(e.target.value)}
          />
          <Input
            label="Long-lived access token"
            type="password"
            placeholder={connected ? '(unchanged — leave blank to keep)' : 'eyJ0eXAiOiJKV1QiLCJhbGci…'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          {testMsg && (
            <p className={`text-xs ${testMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{testMsg.msg}</p>
          )}
          {saveMutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(saveMutation.error)}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={testMutation.isPending}
              disabled={!haUrl.trim()}
              onClick={() => { setTestMsg(null); testMutation.mutate() }}
            >
              Test connection
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              loading={saveMutation.isPending}
              disabled={!haUrl.trim() || (!token.trim() && !connected)}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function IntegrationsSection() {
  return (
    <SettingsCard
      title="Integrations"
      description="Connect external services to automate workflows and surface FilamentHub data."
    >
      <div className="space-y-3">
        <SmtpCard />
        <DiscordCard />
        <HomeAssistantCard />
        <SoonCard
          logo="🐙"
          name="OctoPrint"
          description="Read print job data and sync filament usage automatically."
          docsUrl="https://docs.octoprint.org/en/master/api/"
        />
        <SoonCard
          logo="🌙"
          name="Moonraker / Klipper"
          description="Connect to a Klipper-based printer via the Moonraker API."
          docsUrl="https://moonraker.readthedocs.io/"
        />
        <BambuCard />
      </div>
    </SettingsCard>
  )
}
