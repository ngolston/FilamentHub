import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Check, Copy, ExternalLink, FileJson, Key, Plus, Trash2, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { usersApi } from '@/api/users'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'
import type { ApiKeyInfo } from '@/types/api'

// ── API Keys ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:   z.string().min(1, 'Name is required'),
  scopes: z.string().optional(),
})
type CreateForm = z.infer<typeof createSchema>

function ApiKeysCard() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newKey,     setNewKey]     = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)
  const [deleteId,   setDeleteId]   = useState<string | null>(null)

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: usersApi.listApiKeys,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => usersApi.createApiKey(data.name, data.scopes),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setNewKey(data.key)
      setShowCreate(false)
      reset()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.deleteApiKey(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api-keys'] }); setDeleteId(null) },
  })

  function copyKey() {
    if (!newKey) return
    navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <SettingsCard title="API keys" description="Authenticate your own scripts and integrations with a long-lived token.">
      {newKey && (
        <div className="rounded-lg border border-amber-600/50 bg-amber-900/20 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-300">
            Copy this key now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-surface-2 px-3 py-2 text-sm font-mono text-white select-all">
              {newKey}
            </code>
            <button onClick={copyKey} className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-surface-2 hover:text-white">
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setNewKey(null)}>Dismiss</Button>
        </div>
      )}

      {showCreate ? (
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-3 rounded-lg border border-surface-border bg-surface-2 p-4">
          <p className="text-sm font-medium text-white">New API key</p>
          <Input label="Key name" placeholder="My script, CI pipeline, …" error={errors.name?.message} {...register('name')} />
          <Input label="Scopes (optional)" placeholder="read write" {...register('scopes')} />
          {createMutation.error && <p className="text-sm text-red-400">{getErrorMessage(createMutation.error)}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={createMutation.isPending}>Create key</Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New API key
        </Button>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />)}</div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-gray-500">
          <Key className="h-7 w-7" />
          <p className="text-sm">No API keys yet</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-border rounded-lg border border-surface-border overflow-hidden">
          {keys.map((k) => (
            <ApiKeyRow
              key={k.id}
              apiKey={k}
              confirming={deleteId === k.id}
              onDelete={() => setDeleteId(k.id)}
              onCancel={() => setDeleteId(null)}
              onConfirm={() => deleteMutation.mutate(k.id)}
              deleting={deleteMutation.isPending && deleteId === k.id}
            />
          ))}
        </div>
      )}
    </SettingsCard>
  )
}

function ApiKeyRow({
  apiKey, confirming, onDelete, onCancel, onConfirm, deleting,
}: {
  apiKey: ApiKeyInfo
  confirming: boolean
  onDelete: () => void
  onCancel: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-surface-1 hover:bg-surface-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{apiKey.name}</p>
        <p className="text-xs text-gray-500 font-mono">{apiKey.key_prefix}••••</p>
        <p className="text-xs text-gray-600">
          Created {format(new Date(apiKey.created_at), 'MMM d, yyyy')}
          {apiKey.last_used_at && ` · Last used ${format(new Date(apiKey.last_used_at), 'MMM d, yyyy')}`}
        </p>
      </div>
      <div className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Revoke?</span>
            <Button variant="danger" size="sm" onClick={onConfirm} loading={deleting}>Yes</Button>
            <Button variant="secondary" size="sm" onClick={onCancel}>No</Button>
          </div>
        ) : (
          <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

interface WebhookEntry {
  id: string
  url: string
  events: string
  active: boolean
}

const DEMO_WEBHOOKS: WebhookEntry[] = [
  { id: '1', url: 'https://hooks.example.com/filament/alerts',    events: 'spool.low_stock, spool.empty', active: true },
  { id: '2', url: 'https://n8n.example.com/webhook/fh-print-done', events: 'print.completed',              active: true },
]

function WebhooksCard() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>(DEMO_WEBHOOKS)
  const [showAdd,  setShowAdd]  = useState(false)
  const [newUrl,   setNewUrl]   = useState('')
  const [newEvts,  setNewEvts]  = useState('')
  const [testing,  setTesting]  = useState<string | null>(null)

  function add() {
    if (!newUrl) return
    setWebhooks([...webhooks, { id: String(Date.now()), url: newUrl, events: newEvts || 'all', active: true }])
    setNewUrl(''); setNewEvts(''); setShowAdd(false)
  }

  function remove(id: string) { setWebhooks(webhooks.filter((w) => w.id !== id)) }

  async function testWebhook(id: string) {
    setTesting(id)
    await new Promise((r) => setTimeout(r, 1200))
    setTesting(null)
  }

  return (
    <SettingsCard title="Webhooks" description="FilamentHub will POST a JSON payload to these URLs when events fire.">
      <div className="space-y-2">
        {webhooks.map((w) => (
          <div key={w.id} className="rounded-lg border border-surface-border bg-surface-2 p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-mono text-gray-300 truncate">{w.url}</p>
              <p className="text-xs text-gray-500 mt-0.5">{w.events}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                loading={testing === w.id}
                onClick={() => testWebhook(w.id)}
              >
                <Zap className="h-3 w-3" /> Test
              </Button>
              <button onClick={() => remove(w.id)} className="rounded-lg p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="space-y-3 rounded-lg border border-surface-border bg-surface-2 p-4">
          <Input label="Endpoint URL" placeholder="https://…" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          <Input label="Events (optional)" placeholder="spool.low_stock, print.completed, …" value={newEvts} onChange={(e) => setNewEvts(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={add}>Add webhook</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add webhook
        </Button>
      )}
    </SettingsCard>
  )
}

// ── Docs links ────────────────────────────────────────────────────────────────

function DocLinks() {
  const links = [
    { icon: <BookOpen className="h-4 w-4" />, label: 'API documentation',  href: '/api/v1/docs'   },
    { icon: <FileJson  className="h-4 w-4" />, label: 'OpenAPI spec (JSON)', href: '/api/v1/openapi.json' },
  ]

  return (
    <SettingsCard title="Developer resources" description="Reference documentation and tooling for building on the FilamentHub API.">
      <div className="flex flex-wrap gap-3">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-2 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            {l.icon}
            {l.label}
            <ExternalLink className="h-3 w-3 text-gray-500" />
          </a>
        ))}
      </div>
    </SettingsCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ApiWebhooksSection() {
  return (
    <div className="space-y-6">
      <ApiKeysCard />
      <WebhooksCard />
      <DocLinks />
    </div>
  )
}
