import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus, Trash2, Wind, X, Package } from 'lucide-react'
import { locationsApi } from '@/api/locations'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { cn } from '@/utils/cn'
import type { LocationResponse, SpoolResponse } from '@/types/api'

// ── Add / Edit modal ──────────────────────────────────────────────────────────

function LocationModal({ location, onClose }: { location?: LocationResponse; onClose: () => void }) {
  const qc     = useQueryClient()
  const isEdit = !!location

  const [name,     setName]     = useState(location?.name ?? '')
  const [desc,     setDesc]     = useState(location?.description ?? '')
  const [isDryBox, setIsDryBox] = useState(location?.is_dry_box ?? false)

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof locationsApi.create>[0]) =>
      isEdit ? locationsApi.update(location.id, data) : locationsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); onClose() },
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
          <h2 className="text-base font-semibold text-white">{isEdit ? 'Edit location' : 'Add location'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Name" placeholder="Shelf A, Dry box #1…" value={name} onChange={(e) => setName(e.target.value)} required />
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
            <input type="checkbox" checked={isDryBox} onChange={(e) => setIsDryBox(e.target.checked)} className="rounded border-surface-border accent-primary-500 h-4 w-4" />
          </label>
          {mutation.error && <p className="text-sm text-red-400">{getErrorMessage(mutation.error)}</p>}
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

// ── Spool row ─────────────────────────────────────────────────────────────────

function SpoolRow({ spool }: { spool: SpoolResponse }) {
  const colors = [spool.color_hex, spool.extra_color_hex_2, spool.extra_color_hex_3, spool.extra_color_hex_4].filter(Boolean) as string[]
  const label  = [spool.filament?.material, spool.brand?.name ?? spool.filament?.brand].filter(Boolean).join(' · ') || spool.name || 'Unlabeled'
  const fill   = Math.round(spool.fill_percentage)
  const weight = spool.remaining_weight >= 1000
    ? `${(spool.remaining_weight / 1000).toFixed(2)} kg`
    : `${Math.round(spool.remaining_weight)} g`

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Color swatch */}
      <div className="shrink-0 flex gap-0.5">
        {colors.length > 0 ? colors.map((c, i) => (
          <div key={i} className="h-5 w-5 rounded-full border border-white/10 shadow-sm" style={{ backgroundColor: c }} />
        )) : (
          <div className="h-5 w-5 rounded-full border border-surface-border bg-surface-3" />
        )}
      </div>

      {/* Label + bar */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-200 truncate">{label}</p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', fill > 25 ? 'bg-primary-500' : fill > 10 ? 'bg-yellow-500' : 'bg-red-500')}
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>

      {/* Weight + % */}
      <div className="shrink-0 text-right">
        <p className="text-xs text-gray-400">{weight}</p>
        <p className="text-[10px] text-gray-600">{fill}%</p>
      </div>
    </div>
  )
}

// ── Location card ─────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5

function LocationCard({
  location,
  spools,
  onEdit,
  onDelete,
  deleting,
}: {
  location: LocationResponse
  spools: SpoolResponse[]
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const [showAll,       setShowAll]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDryBox  = location.is_dry_box
  const visible   = showAll ? spools : spools.slice(0, MAX_VISIBLE)
  const remaining = spools.length - MAX_VISIBLE

  return (
    <div className="flex flex-col rounded-2xl border border-surface-border bg-surface-1 overflow-hidden shadow-sm hover:shadow-lg hover:border-surface-border/80 transition-all duration-200">
      {/* Header */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-3 border-b',
        isDryBox ? 'bg-blue-500/10 border-blue-500/20' : 'bg-primary-500/10 border-primary-500/20',
      )}>
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          isDryBox ? 'bg-blue-500/20' : 'bg-primary-500/20',
        )}>
          {isDryBox
            ? <Wind className="h-5 w-5 text-blue-400" />
            : <MapPin className="h-5 w-5 text-primary-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{location.name}</p>
          {location.description && (
            <p className="text-xs text-gray-500 truncate">{location.description}</p>
          )}
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium border',
          isDryBox ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-surface-2 border-surface-border text-gray-400',
        )}>
          {isDryBox ? 'Dry box' : 'Shelf'}
        </span>
      </div>

      {/* Spool list */}
      <div className="flex-1 px-4">
        {spools.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-xs text-gray-600">
            <Package className="h-3.5 w-3.5" />
            No spools assigned
          </div>
        ) : (
          <div className="divide-y divide-surface-border/60">
            {visible.map((s) => <SpoolRow key={s.id} spool={s} />)}
          </div>
        )}

        {!showAll && remaining > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            +{remaining} more spool{remaining > 1 ? 's' : ''}
          </button>
        )}
        {showAll && spools.length > MAX_VISIBLE && (
          <button
            onClick={() => setShowAll(false)}
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Show less
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-surface-border bg-surface-2/40 px-4 py-2.5">
        <span className="text-xs text-gray-600">
          {spools.length} spool{spools.length !== 1 ? 's' : ''}
        </span>

        {confirmDelete ? (
          <>
            <span className="mx-auto text-xs text-gray-400">Delete this location?</span>
            <button onClick={onDelete} disabled={deleting} className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={onEdit} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-surface-2 hover:text-gray-200 transition-colors">
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors">
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

  const { data: locations = [], isLoading: loadingLocs } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
  })

  const { data: spoolsData, isLoading: loadingSpools } = useQuery({
    queryKey: ['spools', 'all-for-locations'],
    queryFn: () => spoolsApi.list({ page_size: 200, status: 'active,storage' }),
  })

  const allSpools = spoolsData?.items ?? []

  // Group spools by location id
  const spoolsByLocation = allSpools.reduce<Record<number, SpoolResponse[]>>((acc, spool) => {
    if (spool.location) {
      const id = spool.location.id
      acc[id] = acc[id] ?? []
      acc[id].push(spool)
    }
    return acc
  }, {})

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { setDeletingId(id); return locationsApi.delete(id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); setDeletingId(null) },
    onError:   () => setDeletingId(null),
  })

  function openAdd()  { setEditTarget(undefined); setModalOpen(true) }
  function openEdit(loc: LocationResponse) { setEditTarget(loc); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditTarget(undefined) }

  const isLoading = loadingLocs || loadingSpools

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Storage Locations</h1>
          <p className="mt-0.5 text-sm text-gray-500">Where your spools live — shelves, drawers, dry boxes.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add location
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-2xl border border-surface-border bg-surface-1 animate-pulse" />
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
              spools={spoolsByLocation[loc.id] ?? []}
              deleting={deletingId === loc.id}
              onEdit={() => openEdit(loc)}
              onDelete={() => deleteMutation.mutate(loc.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && <LocationModal location={editTarget} onClose={closeModal} />}
    </div>
  )
}
