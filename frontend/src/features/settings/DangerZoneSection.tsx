import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/api/users'
import { systemApi } from '@/api/system'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SettingsCard } from './SettingsCard'

interface DangerAction {
  id: string
  title: string
  description: string
  buttonLabel: string
  confirmText: string
  confirmPlaceholder: string
  confirmMatch?: string  // if set, typed value must match this
  needsPassword?: boolean
}

const ACTIONS: DangerAction[] = [
  {
    id: 'clear_inventory',
    title: 'Clear inventory',
    description: 'Permanently deletes all spools from your inventory. Filament profiles and brands are kept.',
    buttonLabel: 'Clear inventory',
    confirmText: 'Type DELETE to confirm',
    confirmPlaceholder: 'DELETE',
    confirmMatch: 'DELETE',
  },
  {
    id: 'clear_history',
    title: 'Clear print history',
    description: 'Removes all print job records, drying sessions, and usage logs. Inventory data is preserved.',
    buttonLabel: 'Clear history',
    confirmText: 'Type DELETE to confirm',
    confirmPlaceholder: 'DELETE',
    confirmMatch: 'DELETE',
  },
  {
    id: 'reset_settings',
    title: 'Reset settings',
    description: 'Resets all preferences, appearance, notification, and general settings to their defaults.',
    buttonLabel: 'Reset settings',
    confirmText: 'Type RESET to confirm',
    confirmPlaceholder: 'RESET',
    confirmMatch: 'RESET',
  },
  {
    id: 'delete_account',
    title: 'Delete account',
    description: 'Permanently deletes your account, all inventory data, print history, and API keys. This cannot be undone.',
    buttonLabel: 'Delete account',
    confirmText: 'Enter your password to confirm',
    confirmPlaceholder: '••••••••',
    needsPassword: true,
  },
]

function DangerRow({ action }: { action: DangerAction }) {
  const logout    = useAuthStore((s) => s.logout)
  const [open,    setOpen]    = useState(false)
  const [value,   setValue]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const canConfirm = action.confirmMatch
    ? value === action.confirmMatch
    : value.length >= 8  // password

  async function execute() {
    setLoading(true)
    setError(null)
    try {
      if (action.id === 'reset_settings') {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('fh_'))
          .forEach((k) => localStorage.removeItem(k))
        setDone(true)
      } else if (action.id === 'clear_inventory') {
        await usersApi.clearInventory()
        setDone(true)
      } else if (action.id === 'clear_history') {
        await usersApi.clearHistory()
        setDone(true)
      } else if (action.id === 'delete_account') {
        await usersApi.deleteAccount(value)
        logout()
      }
      setOpen(false)
      setValue('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 py-4 border-b border-surface-border last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{action.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 max-w-sm">{action.description}</p>
        {done && (
          <p className="text-xs text-green-400 mt-1">Done — changes applied.</p>
        )}
      </div>

      <div className="shrink-0">
        {!open ? (
          <Button variant="danger" size="sm" onClick={() => { setOpen(true); setDone(false) }}>
            {action.buttonLabel}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 min-w-[220px]">
            <p className="text-xs text-gray-400">{action.confirmText}</p>
            <Input
              type={action.needsPassword ? 'password' : 'text'}
              placeholder={action.confirmPlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setValue(''); setError(null) }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!canConfirm}
                loading={loading}
                onClick={execute}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Start Fresh ───────────────────────────────────────────────────────────────

const CONFIRM_PHRASE = 'START FRESH'

function StartFreshCard() {
  const logout   = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [open,    setOpen]    = useState(false)
  const [phrase,  setPhrase]  = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const canConfirm = phrase === CONFIRM_PHRASE && password.length >= 8

  function cancel() {
    setOpen(false)
    setPhrase('')
    setPassword('')
    setError(null)
  }

  async function execute() {
    setLoading(true)
    setError(null)
    try {
      await systemApi.factoryReset(password)
      // Wipe all local state and send to registration
      Object.keys(localStorage)
        .filter((k) => k.startsWith('fh_'))
        .forEach((k) => localStorage.removeItem(k))
      logout()
      navigate('/register')
    } catch (err) {
      setError(getErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <SettingsCard title="Start fresh" description="">
      <div className="flex items-start gap-3 rounded-lg border border-red-700/40 bg-red-900/10 px-4 py-3">
        <RefreshCw className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
        <p className="text-sm text-red-300">
          Deletes <strong>all users, all inventory, all history, and all settings</strong> — every
          piece of data — and resets this instance to a brand-new state. The next person to visit
          will be prompted to create the first admin account. This <strong>cannot be undone</strong>.
        </p>
      </div>

      {!open ? (
        <div className="flex justify-end">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Start fresh
          </Button>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400">
              Type <span className="font-mono font-semibold text-red-300">{CONFIRM_PHRASE}</span> to confirm
            </p>
            <Input
              placeholder={CONFIRM_PHRASE}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400">Enter your admin password</p>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={cancel}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!canConfirm}
              loading={loading}
              onClick={execute}
            >
              Wipe everything &amp; start fresh
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function DangerZoneSection() {
  return (
    <div className="space-y-6">
      <SettingsCard title="Danger zone" description="">
        <div className="flex items-start gap-3 rounded-lg border border-red-700/40 bg-red-900/10 px-4 py-3 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-300">
            Actions in this section are irreversible. Proceed with caution.
          </p>
        </div>

        <div className="divide-y divide-surface-border">
          {ACTIONS.map((a) => (
            <DangerRow key={a.id} action={a} />
          ))}
        </div>
      </SettingsCard>

      <StartFreshCard />
    </div>
  )
}
