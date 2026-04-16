import { useState } from 'react'
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SettingsCard } from './SettingsCard'

interface Integration {
  id: string
  name: string
  description: string
  logo: string
  connected: boolean
  fields: { id: string; label: string; placeholder: string; type?: string }[]
  docsUrl?: string
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'discord',
    name: 'Discord',
    description: 'Post alerts and runout warnings to a Discord channel via webhook.',
    logo: '🟣',
    connected: false,
    fields: [
      { id: 'webhook_url', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/…' },
    ],
  },
  {
    id: 'home_assistant',
    name: 'Home Assistant',
    description: 'Expose spool sensors and trigger automations via the HA REST API.',
    logo: '🏠',
    connected: false,
    fields: [
      { id: 'ha_url',   label: 'Home Assistant URL', placeholder: 'http://homeassistant.local:8123' },
      { id: 'ha_token', label: 'Long-lived access token', placeholder: 'eyJ0eXAi…', type: 'password' },
    ],
  },
  {
    id: 'octoprint',
    name: 'OctoPrint',
    description: 'Read print job data and sync filament usage automatically.',
    logo: '🐙',
    connected: false,
    fields: [
      { id: 'op_url', label: 'OctoPrint URL', placeholder: 'http://octopi.local' },
      { id: 'op_key', label: 'API key', placeholder: 'ABC123…', type: 'password' },
    ],
    docsUrl: 'https://docs.octoprint.org/en/master/api/',
  },
  {
    id: 'moonraker',
    name: 'Moonraker / Klipper',
    description: 'Connect to a Klipper-based printer via the Moonraker API.',
    logo: '🌙',
    connected: false,
    fields: [
      { id: 'mr_url', label: 'Moonraker URL', placeholder: 'http://mainsailos.local' },
    ],
    docsUrl: 'https://moonraker.readthedocs.io/',
  },
  {
    id: 'bambu',
    name: 'Bambu Cloud',
    description: 'Sync print history and AMS slot data from your Bambu Lab account.',
    logo: '🟢',
    connected: false,
    fields: [
      { id: 'bambu_email', label: 'Bambu account email', placeholder: 'you@example.com' },
      { id: 'bambu_token', label: 'Access token',        placeholder: 'From the Bambu Studio app', type: 'password' },
    ],
  },
]

function IntegrationCard({ integration }: { integration: Integration }) {
  const [open,      setOpen]      = useState(false)
  const [connected, setConnected] = useState(integration.connected)
  const [values,    setValues]    = useState<Record<string, string>>(
    Object.fromEntries(integration.fields.map((f) => [f.id, ''])),
  )

  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{integration.logo}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">{integration.name}</p>
              {connected
                ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3 w-3" />Connected</span>
                : <span className="flex items-center gap-1 text-xs text-gray-500"><Circle className="h-3 w-3" />Not connected</span>
              }
            </div>
            <p className="text-xs text-gray-400 mt-0.5 max-w-sm">{integration.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              Docs <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {connected ? (
            <Button variant="secondary" size="sm" onClick={() => setConnected(false)}>
              Disconnect
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
              {open ? 'Cancel' : 'Configure'}
            </Button>
          )}
        </div>
      </div>

      {open && !connected && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          {integration.fields.map((field) => (
            <Input
              key={field.id}
              label={field.label}
              type={field.type ?? 'text'}
              placeholder={field.placeholder}
              value={values[field.id]}
              onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
            />
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => {
                // stub — would call an API in production
                setConnected(true)
                setOpen(false)
              }}
            >
              Connect
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function IntegrationsSection() {
  return (
    <SettingsCard
      title="Integrations"
      description="Connect external services to automate workflows and surface FilamentHub data."
    >
      <div className={cn('space-y-3')}>
        {INTEGRATIONS.map((i) => (
          <IntegrationCard key={i.id} integration={i} />
        ))}
      </div>
    </SettingsCard>
  )
}
