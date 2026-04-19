import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Check, CheckCircle2, Copy, ExternalLink, FileJson, Key, Plus, Trash2, XCircle, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { usersApi } from '@/api/users'
import { webhooksApi } from '@/api/webhooks'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'
import type { ApiKeyInfo, WebhookResponse } from '@/types/api'

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

const webhookSchema = z.object({
  name:   z.string().min(1, 'Name is required'),
  url:    z.string().url('Must be a valid URL'),
  events: z.string().optional(),
  secret: z.string().optional(),
})
type WebhookForm = z.infer<typeof webhookSchema>

function WebhookRow({
  webhook,
  onDelete,
  deleting,
}: {
  webhook: WebhookResponse
  onDelete: () => void
  deleting: boolean
}) {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<{ success: boolean; code: number } | null>(null)

  const testMutation = useMutation({
    mutationFn: () => webhooksApi.test(webhook.id),
    onSuccess: (data) => {
      setTestResult({ success: data.success, code: data.status_code })
      setTimeout(() => setTestResult(null), 4000)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: () => webhooksApi.update(webhook.id, { is_active: !webhook.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  return (
    <div className="rounded-lg border border-surface-border bg-surface-1 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{webhook.name}</p>
            {!webhook.is_active && (
              <span className="shrink-0 rounded text-[9px] font-bold uppercase tracking-wide bg-surface-3 text-gray-400 px-1.5 py-0.5">
                Paused
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-gray-400 truncate mt-0.5">{webhook.url}</p>
          {webhook.events && (
            <p className="text-xs text-gray-500 mt-0.5">{webhook.events}</p>
          )}
          {testResult && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.success
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Delivered ({testResult.code})</>
                : <><XCircle className="h-3.5 w-3.5" /> Failed ({testResult.code || 'no response'})</>
              }
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            loading={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            <Zap className="h-3 w-3" /> Test
          </Button>
          <button
            onClick={() => toggleMutation.mutate()}
            title={webhook.is_active ? 'Pause' : 'Resume'}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-300 transition-colors"
          >
            <span className="text-xs">{webhook.is_active ? '⏸' : '▶'}</span>
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function WebhooksCard() {
  const qc = useQueryClient()
  const [showAdd,   setShowAdd]   = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: webhooksApi.list,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<WebhookForm>({
    resolver: zodResolver(webhookSchema),
  })

  const createMutation = useMutation({
    mutationFn: (data: WebhookForm) =>
      webhooksApi.create({ name: data.name, url: data.url, events: data.events, secret: data.secret || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      setShowAdd(false)
      reset()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { setDeletingId(id); return webhooksApi.delete(id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); setDeletingId(null) },
    onError: () => setDeletingId(null),
  })

  return (
    <SettingsCard title="Webhooks" description="FilamentHub will POST a JSON payload to these URLs when events fire (e.g. spool.alert).">
      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}</div>
      ) : webhooks.length > 0 ? (
        <div className="space-y-2">
          {webhooks.map((w) => (
            <WebhookRow
              key={w.id}
              webhook={w}
              deleting={deletingId === w.id}
              onDelete={() => deleteMutation.mutate(w.id)}
            />
          ))}
        </div>
      ) : !showAdd ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-surface-border py-8 text-center">
          <Zap className="h-7 w-7 text-gray-600" />
          <p className="text-sm text-gray-400">No webhooks yet</p>
        </div>
      ) : null}

      {showAdd ? (
        <form
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="space-y-3 rounded-lg border border-surface-border bg-surface-2 p-4"
        >
          <p className="text-sm font-medium text-white">New webhook</p>
          <Input label="Name" placeholder="n8n, Zapier, my script…" error={errors.name?.message} {...register('name')} />
          <Input label="Endpoint URL" placeholder="https://…" error={errors.url?.message} {...register('url')} />
          <Input label="Events (optional)" placeholder="spool.alert — leave blank for all" {...register('events')} />
          <Input label="Signing secret (optional)" placeholder="HMAC-SHA256 secret" {...register('secret')} />
          {createMutation.error && <p className="text-sm text-red-400">{getErrorMessage(createMutation.error)}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => { setShowAdd(false); reset() }}>Cancel</Button>
            <Button type="submit" size="sm" loading={createMutation.isPending}>Add webhook</Button>
          </div>
        </form>
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
