import { useLocalSetting } from '@/hooks/useLocalSetting'
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

const DEFAULT_ALERT: AlertPrefs = {
  runout: true, low_stock: true, drying: true,
  print_done: false, job_failed: true, spool_empty: true,
}

const DEFAULT_EMAIL: EmailPrefs = {
  runout: false, low_stock: false, drying: false, weekly_digest: true,
}

const ALERT_ROWS: { key: keyof AlertPrefs; label: string; description: string }[] = [
  { key: 'runout',      label: 'Runout warning',    description: 'Alert when a spool is projected to run out within 48 hours.' },
  { key: 'low_stock',   label: 'Low stock',         description: 'Alert when remaining weight drops below the low-stock threshold.' },
  { key: 'drying',      label: 'Drying reminder',   description: 'Remind you when a drying session is about to complete.' },
  { key: 'print_done',  label: 'Print complete',    description: 'Notify when a monitored print job finishes successfully.' },
  { key: 'job_failed',  label: 'Job failed',        description: 'Notify when a print job fails or is cancelled unexpectedly.' },
  { key: 'spool_empty', label: 'Spool depleted',    description: 'Alert when a spool reaches 0 g remaining.' },
]

const EMAIL_ROWS: { key: keyof EmailPrefs; label: string; description: string }[] = [
  { key: 'runout',        label: 'Runout warnings',    description: 'Receive an email for projected runout alerts.' },
  { key: 'low_stock',     label: 'Low stock alerts',   description: 'Receive an email when any spool hits low stock.' },
  { key: 'drying',        label: 'Drying reminders',   description: 'Receive an email when drying sessions complete.' },
  { key: 'weekly_digest', label: 'Weekly digest',      description: 'A summary of inventory changes, prints, and spend each Monday.' },
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
  const [alerts,      setAlerts]      = useLocalSetting<AlertPrefs>('fh_alerts',      DEFAULT_ALERT)
  const [email,       setEmail]       = useLocalSetting<EmailPrefs>('fh_email_notif', DEFAULT_EMAIL)
  const [quietHours,  setQuietHours]  = useLocalSetting('fh_quiet_hours',  false)
  const [quietStart,  setQuietStart]  = useLocalSetting('fh_quiet_start',  '22:00')
  const [quietEnd,    setQuietEnd]    = useLocalSetting('fh_quiet_end',    '08:00')

  function toggleAlert(key: keyof AlertPrefs, val: boolean) {
    setAlerts({ ...alerts, [key]: val })
  }

  function toggleEmail(key: keyof EmailPrefs, val: boolean) {
    setEmail({ ...email, [key]: val })
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
              checked={alerts[row.key]}
              onChange={(v) => toggleAlert(row.key, v)}
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
              checked={email[row.key]}
              onChange={(v) => toggleEmail(row.key, v)}
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
          <Toggle checked={quietHours} onChange={setQuietHours} />
        </div>

        {quietHours && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Start time</label>
              <input
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">End time</label>
              <input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
