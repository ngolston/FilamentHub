import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus, Trash2, Wind, X } from 'lucide-react'
import { locationsApi } from '@/api/locations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'
import type { LocationResponse } from '@/types/api'

// ── Form modal ─────────────────────────────────────────────────────────────────

function LocationModal({
  location,
  onClose,
}: {
  location?: LocationResponse
  onClose: () => void
}) {
  const qc     = useQueryClient()
  const isEdit = !!location

  const [name,     setName]     = useState(location?.name ?? '')
  const [desc,     setDesc]     = useState(location?.description ?? '')
  const [isDryBox, setIsDryBox] = useState(location?.is_dry_box ?? false)

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof locationsApi.create>[0]) =>
      isEdit ? locationsApi.update(location.id, data) : locationsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      onClose()
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      name: name.trim(),
      description: desc.trim() || undefined,
      is_dry_box: isDryBox,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'Edit location' : 'Add location'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            placeholder="Shelf A, Dry box #1…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none resize-none"
            />
          </div>

          {/* Dry box toggle */}
          <label className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-2 px-4 py-3 cursor-pointer">
            <div className="flex items-center gap-2 text-sm text-white">
              <Wind className="h-4 w-4 text-blue-400" />
              Dry box / desiccant cabinet
            </div>
            <input
              type="checkbox"
              checked={isDryBox}
              onChange={(e) => setIsDryBox(e.target.checked)}
              className="rounded border-surface-border accent-primary-500 h-4 w-4"
            />
          </label>

          {mutation.error && (
            <p className="text-sm text-red-400">{getErrorMessage(mutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!name.trim()}>
              {isEdit ? 'Save changes' : 'Add location'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Location row ───────────────────────────────────────────────────────────────

function LocationRow({
  location,
  onEdit,
  onDelete,
  deleting,
}: {
  location: LocationResponse
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-1 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-gray-400">
        {location.is_dry_box
          ? <Wind className="h-4 w-4 text-blue-400" />
          : <MapPin className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{location.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {location.is_dry_box ? 'Dry box / desiccant cabinet' : (location.description || 'No description')}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-300 transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-40"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function LocationsSection() {
  const qc = useQueryClient()
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editTarget,  setEditTarget]  = useState<LocationResponse | undefined>()
  const [deletingId,  setDeletingId]  = useState<number | null>(null)

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      setDeletingId(id)
      return locationsApi.delete(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      setDeletingId(null)
    },
    onError: () => setDeletingId(null),
  })

  return (
    <>
      <SettingsCard
        title="Storage locations"
        description="Define where your spools live — shelves, drawers, dry boxes. Assign locations when adding or editing a spool."
      >
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : locations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-surface-border py-8 text-center">
            <MapPin className="h-8 w-8 text-gray-600" />
            <p className="text-sm text-gray-400">No locations yet.</p>
            <Button size="sm" variant="secondary" onClick={() => { setEditTarget(undefined); setModalOpen(true) }}>
              <Plus className="h-3.5 w-3.5" /> Add first location
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {locations.map((loc) => (
              <LocationRow
                key={loc.id}
                location={loc}
                deleting={deletingId === loc.id}
                onEdit={() => { setEditTarget(loc); setModalOpen(true) }}
                onDelete={() => deleteMutation.mutate(loc.id)}
              />
            ))}
          </div>
        )}

        {locations.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setEditTarget(undefined); setModalOpen(true) }}
            className="mt-2"
          >
            <Plus className="h-3.5 w-3.5" /> Add location
          </Button>
        )}
      </SettingsCard>

      {modalOpen && (
        <LocationModal
          location={editTarget}
          onClose={() => { setModalOpen(false); setEditTarget(undefined) }}
        />
      )}
    </>
  )
}
