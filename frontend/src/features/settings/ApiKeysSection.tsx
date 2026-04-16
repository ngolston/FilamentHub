import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Key, Plus, Trash2, Check } from 'lucide-react'
import { format } from 'date-fns'
import { usersApi } from '@/api/users'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'
import type { ApiKeyInfo } from '@/types/api'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  scopes: z.string().optional(),
})
type CreateForm = z.infer<typeof createSchema>

export function ApiKeysSection() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey]         = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [deleteId, setDeleteId]     = useState<string | null>(null)

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setDeleteId(null)
    },
  })

  function copyKey() {
    if (!newKey) return
    navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <SettingsCard title="API keys" description="Use API keys to authenticate requests from your own scripts or integrations.">

      {/* ── New key banner ───────────────────────────────────────────────── */}
      {newKey && (
        <div className="rounded-lg border border-amber-600/50 bg-amber-900/20 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-300">
            Copy your new API key now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-surface-2 px-3 py-2 text-sm font-mono text-white select-all">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-surface-2 hover:text-white"
              title="Copy"
            >
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="secondary" onClick={() => setNewKey(null)}>Dismiss</Button>
        </div>
      )}

      {/* ── Create form ──────────────────────────────────────────────────── */}
      {showCreate ? (
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-3 rounded-lg border border-surface-border bg-surface-2 p-4">
          <p className="text-sm font-medium text-white">New API key</p>
          <Input label="Key name" placeholder="My script, CI pipeline, …" error={errors.name?.message} {...register('name')} />
          <Input label="Scopes (optional)" placeholder="read:spools write:spools" {...register('scopes')} />
          {createMutation.error && (
            <p className="text-sm text-red-400">{getErrorMessage(createMutation.error)}</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create key</Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New API key
        </Button>
      )}

      {/* ── Key list ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-gray-500">
          <Key className="h-7 w-7" />
          <p className="text-sm">No API keys yet</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-border rounded-lg border border-surface-border overflow-hidden">
          {keys.map((k) => (
            <KeyRow
              key={k.id}
              apiKey={k}
              confirmingDelete={deleteId === k.id}
              onDelete={() => setDeleteId(k.id)}
              onCancelDelete={() => setDeleteId(null)}
              onConfirmDelete={() => deleteMutation.mutate(k.id)}
              deleting={deleteMutation.isPending && deleteId === k.id}
            />
          ))}
        </div>
      )}
    </SettingsCard>
  )
}

interface RowProps {
  apiKey: ApiKeyInfo
  confirmingDelete: boolean
  onDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  deleting: boolean
}

function KeyRow({ apiKey, confirmingDelete, onDelete, onCancelDelete, onConfirmDelete, deleting }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-surface-1 hover:bg-surface-2 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{apiKey.name}</p>
        <p className="text-xs text-gray-500 font-mono mt-0.5">{apiKey.key_prefix}••••</p>
        <p className="text-xs text-gray-600 mt-0.5">
          Created {format(new Date(apiKey.created_at), 'MMM d, yyyy')}
          {apiKey.last_used_at && ` · Last used ${format(new Date(apiKey.last_used_at), 'MMM d, yyyy')}`}
        </p>
      </div>
      <div className="shrink-0">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Revoke?</span>
            <Button variant="danger" onClick={onConfirmDelete} loading={deleting}>Yes</Button>
            <Button variant="secondary" onClick={onCancelDelete}>No</Button>
          </div>
        ) : (
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
            title="Revoke key"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
