import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus, Printer as PrinterIcon, Trash2, Wind, X, Package } from 'lucide-react'
import { locationsApi } from '@/api/locations'
import { spoolsApi } from '@/api/spools'
import { printersApi } from '@/api/printers'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { formatWeight } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { LocationResponse, PrinterResponse, SpoolResponse, SpoolStatus } from '@/types/api'

// ── Add / Edit location modal ─────────────────────────────────────────────────

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

// ── Spool view modal ───────────────────────────────────────────────────────────

function SpoolViewModal({ spool, onClose, onEdit }: {
  spool: SpoolResponse; onClose: () => void; onEdit: () => void
}) {
  const hex    = spool.filament?.color_hex ?? spool.color_hex ?? null
  const name   = spool.name ?? spool.filament?.name ?? `Spool #${spool.id}`
  const brand  = spool.brand?.name ?? spool.filament?.brand?.name ?? null
  const mat    = spool.filament?.material ?? null
  const diam   = spool.filament?.diameter ?? null
  const fill   = Math.min(100, spool.fill_percentage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: hex ?? '#6366f1' }} />
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            {hex && (
              <div className="h-10 w-10 shrink-0 rounded-xl border border-white/10" style={{ backgroundColor: hex }} />
            )}
            <div className="min-w-0 flex-1">
              {brand && <p className="text-[10px] text-gray-500 uppercase tracking-widest">{brand}</p>}
              <p className="font-semibold text-white truncate">{name}</p>
              {mat && <p className="text-xs text-gray-400">{mat}{diam ? ` · ${diam}mm` : ''}</p>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-gray-500 hover:text-gray-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Fill bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Remaining</span>
              <span className="tabular-nums font-medium text-white">
                {formatWeight(spool.remaining_weight)} / {formatWeight(spool.initial_weight)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${fill}%`, backgroundColor: hex ?? '#6366f1' }}
              />
            </div>
            <p className="text-right text-[11px] text-gray-500 tabular-nums">{fill.toFixed(0)}% full</p>
          </div>

          {/* Details */}
          <div className="rounded-xl border border-surface-border bg-surface-2 p-3 space-y-2">
            {spool.location && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Location</span>
                <span className="text-gray-200">{spool.location.name}</span>
              </div>
            )}
            {(spool.filament?.print_temp_min || spool.filament?.print_temp_max) && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Nozzle temp</span>
                <span className="text-gray-200">
                  {spool.filament.print_temp_min && spool.filament.print_temp_max
                    ? `${spool.filament.print_temp_min}–${spool.filament.print_temp_max}°C`
                    : `${spool.filament.print_temp_min ?? spool.filament.print_temp_max}°C`}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Spool ID</span>
              <span className="font-mono text-gray-400">#{spool.id}</span>
            </div>
          </div>

          {spool.notes && (
            <p className="text-xs text-gray-400 whitespace-pre-wrap">{spool.notes}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit spool
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Quick edit modal ───────────────────────────────────────────────────────────

function QuickEditModal({ spool, locations, onClose, onSave }: {
  spool: SpoolResponse
  locations: { id: number; name: string }[]
  onClose: () => void
  onSave: (data: { name?: string; status: SpoolStatus; location_id?: number | null; used_weight: number; notes?: string }) => Promise<void>
}) {
  const [name,       setName]       = useState(spool.name ?? '')
  const [status,     setStatus]     = useState<SpoolStatus>(spool.status)
  const [locationId, setLocationId] = useState<string>(spool.location ? String(spool.location.id) : '')
  const [remaining,  setRemaining]  = useState(String(Math.round(spool.remaining_weight)))
  const [notes,      setNotes]      = useState(spool.notes ?? '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const initial    = spool.initial_weight
  const remainNum  = Math.max(0, Math.min(initial, Number(remaining) || 0))
  const fillPct    = initial > 0 ? (remainNum / initial) * 100 : 0
  const hex        = spool.filament?.color_hex ?? spool.color_hex ?? null

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await onSave({
        name:        name.trim() || undefined,
        status,
        location_id: locationId ? Number(locationId) : null,
        used_weight: Math.max(0, initial - remainNum),
        notes:       notes.trim() || undefined,
      })
    } catch {
      setError('Failed to save changes')
      setSaving(false)
    }
  }

  const STATUS_OPTS: { value: SpoolStatus; label: string; color: string }[] = [
    { value: 'active',   label: 'Active',   color: 'bg-emerald-500' },
    { value: 'storage',  label: 'Storage',  color: 'bg-cyan-500' },
    { value: 'archived', label: 'Archived', color: 'bg-gray-500' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: hex ?? '#6366f1' }} />
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Edit spool</h2>
            <button onClick={onClose} className="rounded-md p-1 text-gray-500 hover:text-gray-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={spool.filament?.name ?? `Spool #${spool.id}`}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Status</label>
            <div className="flex gap-2">
              {STATUS_OPTS.map((opt) => (
                <button key={opt.value} onClick={() => setStatus(opt.value)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    status === opt.value
                      ? 'border-primary-500/60 bg-primary-600/20 text-white'
                      : 'border-surface-border bg-surface-2 text-gray-400 hover:text-gray-200',
                  )}>
                  <span className={`h-2 w-2 rounded-full ${opt.color}`} />{opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Location</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none">
              <option value="">— No location —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Remaining (g)</label>
              <span className="text-xs text-gray-500 tabular-nums">of {initial.toFixed(0)}g initial</span>
            </div>
            <input type="number" min={0} max={initial} value={remaining}
              onChange={(e) => setRemaining(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none" />
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, fillPct)}%`, backgroundColor: hex ?? '#6366f1' }} />
            </div>
            <p className="text-right text-[11px] text-gray-500 tabular-nums">{fillPct.toFixed(0)}% full</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Any notes about this spool…"
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-primary-500 focus:outline-none resize-none" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={saving} onClick={handleSave}>Save changes</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Slot tile (printer AMS / direct slot) ──────────────────────────────────────

function SlotTile({ label, spool, onClickSpool }: {
  label: string
  spool: SpoolResponse | undefined
  onClickSpool: (s: SpoolResponse) => void
}) {
  const colorHex   = spool?.filament?.color_hex ?? spool?.color_hex ?? null
  const spoolLabel = spool?.name ?? spool?.filament?.name ?? spool?.filament?.material ?? null

  return (
    <button
      onClick={() => spool && onClickSpool(spool)}
      disabled={!spool}
      title={spool ? `${spoolLabel ?? 'Spool'} — click to view` : label}
      className={cn(
        'relative flex h-16 w-full flex-col items-center justify-center rounded-lg border transition-all',
        !spool
          ? 'border-dashed border-surface-border bg-surface-3 text-gray-600 cursor-default'
          : 'border-transparent cursor-pointer hover:brightness-110',
      )}
      style={colorHex ? { backgroundColor: `${colorHex}22`, borderColor: `${colorHex}66` } : undefined}
    >
      {colorHex && (
        <div className="mb-1 h-4 w-4 rounded-full border border-black/20" style={{ backgroundColor: colorHex }} />
      )}
      {spool ? (
        <span className="px-1 text-center text-xs font-medium leading-tight text-white line-clamp-2">
          {spoolLabel ?? '—'}
        </span>
      ) : (
        <Package className="h-4 w-4" />
      )}
      <span className="mt-0.5 text-[10px] font-semibold text-gray-400">{label}</span>
    </button>
  )
}

// ── Spool row (storage location card) ─────────────────────────────────────────

function SpoolRow({ spool, onClickSpool }: {
  spool: SpoolResponse
  onClickSpool: (s: SpoolResponse) => void
}) {
  const colors = [
    spool.color_hex ?? spool.filament?.color_hex,
    spool.extra_color_hex_2,
    spool.extra_color_hex_3,
    spool.extra_color_hex_4,
  ].filter(Boolean) as string[]
  const label  = [spool.filament?.material, spool.brand?.name ?? spool.filament?.brand?.name].filter(Boolean).join(' · ') || spool.name || 'Unlabeled'
  const fill   = Math.round(spool.fill_percentage)

  return (
    <button
      onClick={() => onClickSpool(spool)}
      className="flex w-full items-center gap-3 py-2.5 rounded-lg px-2 -mx-2 hover:bg-surface-2/60 transition-colors group"
    >
      <div className="shrink-0 flex gap-1">
        {colors.length > 0 ? colors.map((c, i) => (
          <div key={i} className="h-6 w-6 rounded-full border border-white/15 shadow-sm" style={{ backgroundColor: c }} />
        )) : (
          <div className="h-6 w-6 rounded-full border border-surface-border bg-surface-3" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-xs font-medium text-gray-200 truncate">{label}</p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', fill > 25 ? 'bg-primary-500' : fill > 10 ? 'bg-yellow-500' : 'bg-red-500')}
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-gray-400">{formatWeight(spool.remaining_weight)}</p>
        <p className="text-[10px] text-gray-600">{fill}%</p>
      </div>
      <Pencil className="h-3 w-3 shrink-0 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

// ── Printer card ───────────────────────────────────────────────────────────────

function PrinterCard({ printer, spoolMap, onClickSpool }: {
  printer: PrinterResponse
  spoolMap: Map<number, SpoolResponse>
  onClickSpool: (s: SpoolResponse) => void
}) {
  const directSpool = printer.direct_spool_id ? spoolMap.get(printer.direct_spool_id) : undefined
  const totalSlots  = (printer.direct_spool_id !== null ? 1 : 0) +
    printer.ams_units.reduce((n, u) => n + u.slots.length, 0)
  const filledSlots = (printer.direct_spool_id ? 1 : 0) +
    printer.ams_units.reduce((n, u) => n + u.slots.filter((s) => s.spool_id !== null).length, 0)
  const hasContent  = printer.direct_spool_id !== null || printer.ams_units.length > 0

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-primary-500/10 border-primary-500/20">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/20">
          <PrinterIcon className="h-5 w-5 text-primary-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{printer.name}</p>
          {printer.model && <p className="text-xs text-gray-500">{printer.model}</p>}
        </div>
        {totalSlots > 0 && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium border bg-surface-2 border-surface-border text-gray-400">
            {filledSlots}/{totalSlots} loaded
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {!hasContent ? (
          <p className="text-xs text-gray-600 py-2">No slots configured for this printer.</p>
        ) : (
          <>
            {/* Direct spool slot */}
            {printer.direct_spool_id !== null && (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Direct</p>
                <div className="w-1/4 min-w-[4rem]">
                  <SlotTile label="Ext 1" spool={directSpool} onClickSpool={onClickSpool} />
                </div>
              </div>
            )}

            {/* AMS units */}
            {printer.ams_units.map((unit) => {
              const letter = String.fromCharCode(65 + unit.unit_index)
              return (
                <div key={unit.id}>
                  <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wider">AMS {letter}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {unit.slots.map((slot) => {
                      const spool = slot.spool_id ? spoolMap.get(slot.spool_id) : undefined
                      return (
                        <SlotTile
                          key={slot.slot_index}
                          label={`${letter}${slot.slot_index + 1}`}
                          spool={spool}
                          onClickSpool={onClickSpool}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ── Storage location card ──────────────────────────────────────────────────────

const MAX_VISIBLE = 5

function LocationCard({
  location, spools, onEdit, onDelete, deleting, onClickSpool,
}: {
  location: LocationResponse
  spools: SpoolResponse[]
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
  onClickSpool: (s: SpoolResponse) => void
}) {
  const [showAll, setShowAll]             = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDryBox  = location.is_dry_box
  const visible   = showAll ? spools : spools.slice(0, MAX_VISIBLE)
  const remaining = spools.length - MAX_VISIBLE

  return (
    <div className="flex flex-col rounded-2xl border border-surface-border bg-surface-1 overflow-hidden shadow-sm hover:shadow-lg hover:border-surface-border/80 transition-all duration-200">
      <div className={cn(
        'flex items-center gap-3 px-4 py-3 border-b',
        isDryBox ? 'bg-blue-500/10 border-blue-500/20' : 'bg-primary-500/10 border-primary-500/20',
      )}>
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          isDryBox ? 'bg-blue-500/20' : 'bg-primary-500/20',
        )}>
          {isDryBox ? <Wind className="h-5 w-5 text-blue-400" /> : <MapPin className="h-5 w-5 text-primary-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{location.name}</p>
          {location.description && <p className="text-xs text-gray-500 truncate">{location.description}</p>}
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium border',
          isDryBox ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-surface-2 border-surface-border text-gray-400',
        )}>
          {isDryBox ? 'Dry box' : 'Shelf'}
        </span>
      </div>

      <div className="flex-1 px-4">
        {spools.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-xs text-gray-600">
            <Package className="h-3.5 w-3.5" /> No spools assigned
          </div>
        ) : (
          <div className="divide-y divide-surface-border/60">
            {visible.map((s) => <SpoolRow key={s.id} spool={s} onClickSpool={onClickSpool} />)}
          </div>
        )}
        {!showAll && remaining > 0 && (
          <button onClick={() => setShowAll(true)} className="w-full py-2 text-xs text-primary-400 hover:text-primary-300 transition-colors">
            +{remaining} more spool{remaining > 1 ? 's' : ''}
          </button>
        )}
        {showAll && spools.length > MAX_VISIBLE && (
          <button onClick={() => setShowAll(false)} className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Show less
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-surface-border bg-surface-2/40 px-4 py-2.5">
        <span className="text-xs text-gray-600">{spools.length} spool{spools.length !== 1 ? 's' : ''}</span>
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
  const [viewSpool,  setViewSpool]  = useState<SpoolResponse | null>(null)
  const [quickEdit,  setQuickEdit]  = useState<SpoolResponse | null>(null)

  const { data: locations = [], isLoading: loadingLocs } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
  })
  const { data: spoolsData, isLoading: loadingSpools } = useQuery({
    queryKey: ['spools', 'all-for-locations'],
    queryFn: () => spoolsApi.list({ page_size: 200, status: 'active,storage' }),
  })
  const { data: printers = [], isLoading: loadingPrinters } = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.list,
  })

  const allSpools = spoolsData?.items ?? []

  const spoolMap = new Map(allSpools.map((s) => [s.id, s]))

  // Spool IDs loaded into a printer slot
  const slottedSpoolIds = new Set<number>()
  for (const printer of printers) {
    if (printer.direct_spool_id) slottedSpoolIds.add(printer.direct_spool_id)
    for (const unit of printer.ams_units)
      for (const slot of unit.slots)
        if (slot.spool_id) slottedSpoolIds.add(slot.spool_id)
  }

  // Storage locations only (no printer_id)
  const storageLocations = locations.filter((l) => !l.printer_id)

  // Spools by storage location (exclude printer-slotted spools)
  const spoolsByLocation = allSpools.reduce<Record<number, SpoolResponse[]>>((acc, spool) => {
    if (spool.location && !slottedSpoolIds.has(spool.id)) {
      acc[spool.location.id] = acc[spool.location.id] ?? []
      acc[spool.location.id].push(spool)
    }
    return acc
  }, {})

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof spoolsApi.update>[1] }) =>
      spoolsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spools'] })
      setQuickEdit(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { setDeletingId(id); return locationsApi.delete(id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); setDeletingId(null) },
    onError:   () => setDeletingId(null),
  })

  function openAdd()  { setEditTarget(undefined); setModalOpen(true) }
  function openEdit(loc: LocationResponse) { setEditTarget(loc); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditTarget(undefined) }

  const isLoading = loadingLocs || loadingSpools || loadingPrinters

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Locations</h1>
          <p className="mt-0.5 text-sm text-gray-500">Track where your spools and printers are.</p>
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
      ) : (
        <div className="space-y-8">

          {/* ── Printer Locations ────────────────────────────────────────────── */}
          {printers.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Printer Locations</h2>
                <div className="flex-1 h-px bg-surface-border" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {printers.map((printer) => (
                  <PrinterCard
                    key={printer.id}
                    printer={printer}
                    spoolMap={spoolMap}
                    onClickSpool={setViewSpool}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Storage Locations ────────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Storage Locations</h2>
              <div className="flex-1 h-px bg-surface-border" />
            </div>
            {storageLocations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-surface-border py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
                  <MapPin className="h-7 w-7 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-300">No storage locations yet</p>
                  <p className="mt-1 text-xs text-gray-500">Add a shelf, drawer, or dry box.</p>
                </div>
                <Button onClick={openAdd} variant="secondary" size="sm">
                  <Plus className="h-4 w-4" /> Add first location
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {storageLocations.map((loc) => (
                  <LocationCard
                    key={loc.id}
                    location={loc}
                    spools={spoolsByLocation[loc.id] ?? []}
                    deleting={deletingId === loc.id}
                    onEdit={() => openEdit(loc)}
                    onDelete={() => deleteMutation.mutate(loc.id)}
                    onClickSpool={setViewSpool}
                  />
                ))}
              </div>
            )}
          </section>

        </div>
      )}

      {/* ── Spool view modal ──────────────────────────────────────────────────── */}
      {viewSpool && (
        <SpoolViewModal
          spool={viewSpool}
          onClose={() => setViewSpool(null)}
          onEdit={() => { setViewSpool(null); setQuickEdit(viewSpool) }}
        />
      )}

      {/* ── Quick edit modal ──────────────────────────────────────────────────── */}
      {quickEdit && (
        <QuickEditModal
          spool={quickEdit}
          locations={storageLocations}
          onClose={() => setQuickEdit(null)}
          onSave={(data) => updateMutation.mutateAsync({ id: quickEdit.id, data }).then(() => {})}
        />
      )}

      {modalOpen && <LocationModal location={editTarget} onClose={closeModal} />}
    </div>
  )
}
