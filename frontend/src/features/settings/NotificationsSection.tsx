import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/api/users'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsCard } from './SettingsCard'

interface AlertPrefs {
  runout:       boolean
  low_stock:    boolean
  drying:       boolean
  print_done:   boolean
  job_failed:   boolean
  spool_empty:  boolean
}

interface EmailPrefs {
  runout:       boolean
  low_stock:    boolean
  drying:       boolean
  weekly_digest: boolean
}

interface QuietHoursPrefs {
  enabled: boolean
  start:   string
  end:     string
}

interface NotifPrefs {
  alerts:      AlertPrefs
  email:       EmailPrefs
  quiet_hours: QuietHoursPrefs
}

const DEFAULT_PREFS: NotifPrefs = {
  alerts: {
    runout: true, low_stock: true, drying: true,
    print_done: false, job_failed: true, spool_empty: true,
  },
  email: {
    runout: false, low_stock: false, drying: false, weekly_digest: true,
  },
  quiet_hours: { enabled: false, start: '22:00', end: '08:00' },
}

const ALERT_ROWS: { key: keyof AlertPrefs; label: string; description: string }[] = [
  { key: 'runout',      label: 'Runout warning',  description: 'Alert when a spool is projected to run out within 48 hours.' },
  { key: 'low_stock',   label: 'Low stock',       description: 'Alert when remaining weight drops below the low-stock threshold.' },
  { key: 'drying',      label: 'Drying reminder', description: 'Remind you when a drying session is about to complete.' },
  { key: 'print_done',  label: 'Print complete',  description: 'Notify when a monitored print job finishes successfully.' },
  { key: 'job_failed',  label: 'Job failed',      description: 'Notify when a print job fails or is cancelled unexpectedly.' },
  { key: 'spool_empty', label: 'Spool depleted',  description: 'Alert when a spool reaches 0 g remaining.' },
]

const EMAIL_ROWS: { key: keyof EmailPrefs; label: string; description: string }[] = [
  { key: 'runout',        label: 'Runout warnings',  description: 'Receive an email for projected runout alerts.' },
  { key: 'low_stock',     label: 'Low stock alerts', description: 'Receive an email when any spool hits low stock.' },
  { key: 'drying',        label: 'Drying reminders', description: 'Receive an email when drying sessions complete.' },
  { key: 'weekly_digest', label: 'Weekly digest',    description: 'A summary of inventory changes, prints, and spend each Monday.' },
]

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-surface-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export function NotificationsSection() {
  const qc = useQueryClient()

  const { data: serverPrefs } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: usersApi.getNotificationPrefs,
    select: (d) => d as unknown as NotifPrefs,
  })

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)

  // Sync server data into local state once loaded
  useEffect(() => {
    if (serverPrefs) setPrefs(serverPrefs)
  }, [serverPrefs])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => usersApi.updateNotificationPrefs(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-prefs'] }),
  })

  // Debounce saves so rapid toggles don't hammer the API
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedSave = useCallback((patch: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveMutation.mutate(patch), 600)
  }, [saveMutation])

  function setAlerts(key: keyof AlertPrefs, val: boolean) {
    const updated = { ...prefs, alerts: { ...prefs.alerts, [key]: val } }
    setPrefs(updated)
    debouncedSave({ alerts: updated.alerts })
  }

  function setEmail(key: keyof EmailPrefs, val: boolean) {
    const updated = { ...prefs, email: { ...prefs.email, [key]: val } }
    setPrefs(updated)
    debouncedSave({ email: updated.email })
  }

  function setQuiet(patch: Partial<QuietHoursPrefs>) {
    const updated = { ...prefs, quiet_hours: { ...prefs.quiet_hours, ...patch } }
    setPrefs(updated)
    debouncedSave({ quiet_hours: updated.quiet_hours })
  }

  return (
    <div className="space-y-6">
      <SettingsCard title="In-app notifications" description="Control which events create alerts inside FilamentHub.">
        <div className="divide-y divide-surface-border">
          {ALERT_ROWS.map((row) => (
            <ToggleRow
              key={row.key}
              label={row.label}
              description={row.description}
              checked={prefs.alerts[row.key]}
              onChange={(v) => setAlerts(row.key, v)}
            />
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Email notifications" description="Emails are sent to the address on your account.">
        <div className="divide-y divide-surface-border">
          {EMAIL_ROWS.map((row) => (
            <ToggleRow
              key={row.key}
              label={row.label}
              description={row.description}
              checked={prefs.email[row.key]}
              onChange={(v) => setEmail(row.key, v)}
            />
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Quiet hours" description="Suppress in-app notifications during a defined time window.">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-white">Enable quiet hours</p>
            <p className="text-xs text-gray-500 mt-0.5">No notification banners will appear during this window.</p>
          </div>
          <Toggle checked={prefs.quiet_hours.enabled} onChange={(v) => setQuiet({ enabled: v })} />
        </div>

        {prefs.quiet_hours.enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Start time</label>
              <input
                type="time"
                value={prefs.quiet_hours.start}
                onChange={(e) => setQuiet({ start: e.target.value })}
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">End time</label>
              <input
                type="time"
                value={prefs.quiet_hours.end}
                onChange={(e) => setQuiet({ end: e.target.value })}
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
