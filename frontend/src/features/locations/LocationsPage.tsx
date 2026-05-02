import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus, Trash2, Wind, X, Package } from 'lucide-react'
import { locationsApi } from '@/api/locations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { cn } from '@/utils/cn'
import type { LocationResponse } from '@/types/api'

// ── Add / Edit modal ──────────────────────────────────────────────────────────

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
    mutation.mutate({ name: name.trim(), description: desc.trim() || undefined, is_dry_box: isDryBox })
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

// ── Location card ─────────────────────────────────────────────────────────────

function LocationCard({
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDryBox = location.is_dry_box

  return (
    <div className="group flex flex-col rounded-2xl border border-surface-border bg-surface-1 overflow-hidden shadow-sm hover:shadow-lg hover:border-surface-border/80 transition-all duration-200">
      {/* Banner */}
      <div className={cn(
        'flex items-center justify-center h-24 border-b',
        isDryBox
          ? 'bg-blue-500/10 border-blue-500/20'
          : 'bg-primary-500/10 border-primary-500/20',
      )}>
        {isDryBox
          ? <Wind className="h-12 w-12 text-blue-400 opacity-80" />
          : <MapPin className="h-12 w-12 text-primary-400 opacity-80" />}
      </div>

      {/* Body */}
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate">{location.name}</h3>
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
              {location.description || (isDryBox ? 'Dry box / desiccant cabinet' : 'Storage location')}
            </p>
          </div>
          <span className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium border',
            isDryBox
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              : 'bg-surface-2 border-surface-border text-gray-400',
          )}>
            {isDryBox ? 'Dry box' : 'Shelf'}
          </span>
        </div>

        {/* Spool count */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
          <Package className="h-3.5 w-3.5" />
          <span>
            {location.spool_count === 0
              ? 'No spools'
              : `${location.spool_count} spool${location.spool_count === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-surface-border bg-surface-2/40 px-4 py-2.5">
        {confirmDelete ? (
          <>
            <span className="text-xs text-gray-400 mr-auto">Delete this location?</span>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-surface-2 hover:text-gray-200 transition-colors"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LocationsPage() {
  const qc = useQueryClient()
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editTarget, setEditTarget] = useState<LocationResponse | undefined>()
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      setDeletingId(id)
      return locationsApi.delete(id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); setDeletingId(null) },
    onError:   () => setDeletingId(null),
  })

  function openAdd()  { setEditTarget(undefined); setModalOpen(true) }
  function openEdit(loc: LocationResponse) { setEditTarget(loc); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditTarget(undefined) }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Storage Locations</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Where your spools live — shelves, drawers, dry boxes.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add location
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl border border-surface-border bg-surface-1 animate-pulse" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-surface-border py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
            <MapPin className="h-8 w-8 text-gray-600" />
          </div>
          <div>
            <p className="text-base font-medium text-gray-300">No locations yet</p>
            <p className="mt-1 text-sm text-gray-500">Add a shelf, drawer, or dry box to get started.</p>
          </div>
          <Button onClick={openAdd} variant="secondary">
            <Plus className="h-4 w-4" /> Add first location
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <LocationCard
              key={loc.id}
              location={loc}
              deleting={deletingId === loc.id}
              onEdit={() => openEdit(loc)}
              onDelete={() => deleteMutation.mutate(loc.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <LocationModal location={editTarget} onClose={closeModal} />
      )}
    </div>
  )
}
