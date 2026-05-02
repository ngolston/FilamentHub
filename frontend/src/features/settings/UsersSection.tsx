import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X, Trash2, ChevronDown } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'
import { SettingsCard } from './SettingsCard'
import { getErrorMessage } from '@/api/client'
import type { UserResponse } from '@/types/api'

const ROLE_OPTIONS = ['admin', 'editor', 'viewer'] as const

function RoleSelect({ user, onUpdate }: { user: UserResponse; onUpdate: (role: string) => void }) {
  return (
    <div className="relative">
      <select
        value={user.role}
        onChange={(e) => onUpdate(e.target.value)}
        className="appearance-none rounded-md border border-surface-border bg-surface-2 px-3 py-1.5 pr-7 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
    </div>
  )
}

export function UsersSection() {
  const currentUser = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.listUsers,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminApi.updateUser>[1] }) =>
      adminApi.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'pending-count'] })
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'pending-count'] })
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const pending = users.filter((u) => !u.is_approved)
  const approved = users.filter((u) => u.is_approved)

  function approve(user: UserResponse, role: string) {
    updateMutation.mutate({ id: user.id, data: { is_approved: true, role } })
  }

  function reject(user: UserResponse) {
    deleteMutation.mutate(user.id)
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {/* Pending approvals */}
      {pending.length > 0 && (
        <SettingsCard
          title="Pending Approval"
          description={`${pending.length} account${pending.length > 1 ? 's' : ''} waiting for review.`}
        >
          <div className="divide-y divide-surface-border">
            {pending.map((user) => (
              <PendingRow
                key={user.id}
                user={user}
                onApprove={(role) => approve(user, role)}
                onReject={() => reject(user)}
                loading={updateMutation.isPending || deleteMutation.isPending}
              />
            ))}
          </div>
        </SettingsCard>
      )}

      {/* All approved users */}
      <SettingsCard title="Users" description="Manage roles and access for approved accounts.">
        {approved.length === 0 ? (
          <p className="text-sm text-gray-500">No approved users yet.</p>
        ) : (
          <div className="divide-y divide-surface-border">
            {approved.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === currentUser?.id}
                onRoleChange={(role) => updateMutation.mutate({ id: user.id, data: { role } })}
                onDelete={() => deleteMutation.mutate(user.id)}
                loading={updateMutation.isPending || deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  )
}

function PendingRow({
  user, onApprove, onReject, loading,
}: {
  user: UserResponse
  onApprove: (role: string) => void
  onReject: () => void
  loading: boolean
}) {
  const [role, setRole] = useState('editor')
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
        <p className="text-xs text-gray-500 truncate">{user.email}</p>
        <p className="text-xs text-gray-600 mt-0.5">Registered {new Date(user.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="appearance-none rounded-md border border-surface-border bg-surface-2 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={() => onApprove(role)}
          disabled={loading}
          title="Approve"
          className="rounded-md p-1.5 text-green-400 hover:bg-green-900/30 hover:text-green-300 transition-colors disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          title="Reject & delete"
          className="rounded-md p-1.5 text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function UserRow({
  user, isSelf, onRoleChange, onDelete, loading,
}: {
  user: UserResponse
  isSelf: boolean
  onRoleChange: (role: string) => void
  onDelete: () => void
  loading: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
          {isSelf && <span className="text-xs text-primary-400">(you)</span>}
        </div>
        <p className="text-xs text-gray-500 truncate">{user.email}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isSelf ? (
          <>
            <RoleSelect user={user} onUpdate={onRoleChange} />
            {confirmDelete ? (
              <>
                <button
                  onClick={onDelete}
                  disabled={loading}
                  className="text-xs text-red-400 hover:text-red-300 font-medium"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                title="Delete user"
                className="rounded-md p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <span className="rounded-md border border-surface-border bg-surface-2 px-3 py-1.5 text-xs text-gray-400 capitalize">{user.role}</span>
        )}
      </div>
    </div>
  )
}
