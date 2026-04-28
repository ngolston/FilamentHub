import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { printersApi } from '@/api/printers'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import type { AmsSpoolSummary, AmsUnit, PrinterResponse } from '@/types/api'


interface AmsGridProps {
  printer: PrinterResponse
  canEdit: boolean
}

export function AmsGrid({ printer, canEdit }: AmsGridProps) {
  const queryClient = useQueryClient()
  const [assigningSlot, setAssigningSlot] = useState<
    | { type: 'ams'; unitId: number; slotIndex: number; currentSpoolId: number | null }
    | { type: 'direct'; currentSpoolId: number | null }
    | null
  >(null)

  const assignedSpoolIds = useMemo(() => {
    const ids = new Set<number>()
    printer.ams_units.forEach(u => u.slots.forEach(s => { if (s.spool_id) ids.add(s.spool_id) }))
    if (printer.direct_spool_id) ids.add(printer.direct_spool_id)
    return ids
  }, [printer])

  const moveSpool = useMutation({
    mutationFn: async ({ fromUnitId, fromSlot, toUnitId, toSlot, spoolId }: {
      fromUnitId: number; fromSlot: number; toUnitId: number; toSlot: number; spoolId: number
    }) => {
      await printersApi.assignAmsSlot(printer.id, toUnitId, toSlot, spoolId)
      await printersApi.assignAmsSlot(printer.id, fromUnitId, fromSlot, null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      setAssigningSlot(null)
    },
  })

  const moveTargets = useMemo(() => {
    if (!assigningSlot || assigningSlot.type !== 'ams' || !assigningSlot.currentSpoolId) return []
    return [...printer.ams_units]
      .sort((a, b) => a.unit_index - b.unit_index)
      .flatMap((unit, unitIdx) =>
        [...unit.slots]
          .sort((a, b) => a.slot_index - b.slot_index)
          .filter(s => s.spool_id === null && !(unit.id === assigningSlot.unitId && s.slot_index === assigningSlot.slotIndex))
          .map(s => ({
            unitId: unit.id,
            slotIndex: s.slot_index,
            label: `${String.fromCharCode(65 + unitIdx)}${s.slot_index + 1}`,
          }))
      )
  }, [assigningSlot, printer.ams_units])

  const addUnit = useMutation({
    mutationFn: () => printersApi.addAmsUnit(printer.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['printers'] }),
  })

  const assignSlot = useMutation({
    mutationFn: ({ unitId, slotIndex, spoolId }: { unitId: number; slotIndex: number; spoolId: number | null }) =>
      printersApi.assignAmsSlot(printer.id, unitId, slotIndex, spoolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      setAssigningSlot(null)
    },
  })

  const assignDirect = useMutation({
    mutationFn: (spoolId: number | null) => printersApi.assignDirectSpool(printer.id, spoolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      setAssigningSlot(null)
    },
  })

  const hasContent = printer.ams_units.length > 0 || printer.direct_spool_id !== null
  if (!hasContent && !canEdit) return null

  // Sort units by unit_index; letter = A, B, C…
  const sortedUnits = [...printer.ams_units].sort((a, b) => a.unit_index - b.unit_index)

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">AMS Units</span>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            loading={addUnit.isPending}
            onClick={() => addUnit.mutate()}
          >
            <Plus className="h-3 w-3" />
            Add AMS
          </Button>
        )}
      </div>

      {sortedUnits.map((unit, unitIdx) => {
        const letter = String.fromCharCode(65 + unitIdx) // A, B, C...
        return (
          <AmsUnitRow
            key={unit.id}
            unit={unit}
            letter={letter}
            canEdit={canEdit}
            onAssign={(slotIndex, spoolId) => setAssigningSlot({ type: 'ams', unitId: unit.id, slotIndex, currentSpoolId: spoolId })}
            onClear={(slotIndex) => assignSlot.mutate({ unitId: unit.id, slotIndex, spoolId: null })}
          />
        )
      })}

      {/* External / direct spool */}
      <ExternalSlot
        spool={printer.direct_spool}
        canEdit={canEdit}
        onAssign={() => setAssigningSlot({ type: 'direct', currentSpoolId: printer.direct_spool?.id ?? null })}
        onClear={() => assignDirect.mutate(null)}
        isPending={assignDirect.isPending}
      />

      {assigningSlot && (
        <SpoolPickerModal
          printerId={printer.id}
          slotLabel={
            assigningSlot.type === 'direct'
              ? 'External 1'
              : (() => {
                  const unitIdx = sortedUnits.findIndex((u) => u.id === assigningSlot.unitId)
                  const letter = String.fromCharCode(65 + unitIdx)
                  return `${letter}${assigningSlot.slotIndex + 1}`
                })()
          }
          assignedSpoolIds={assignedSpoolIds}
          currentSpoolId={assigningSlot.currentSpoolId}
          moveTargets={moveTargets}
          onMoveToSlot={(toUnitId, toSlot) => {
            if (assigningSlot.type === 'ams' && assigningSlot.currentSpoolId) {
              moveSpool.mutate({
                fromUnitId: assigningSlot.unitId,
                fromSlot: assigningSlot.slotIndex,
                toUnitId,
                toSlot,
                spoolId: assigningSlot.currentSpoolId,
              })
            }
          }}
          onSelect={(spoolId) => {
            if (assigningSlot.type === 'direct') {
              assignDirect.mutate(spoolId)
            } else {
              assignSlot.mutate({ unitId: assigningSlot.unitId, slotIndex: assigningSlot.slotIndex, spoolId })
            }
          }}
          onClose={() => setAssigningSlot(null)}
          isPending={assignSlot.isPending || assignDirect.isPending || moveSpool.isPending}
        />
      )}
    </div>
  )
}

// ── AMS unit row ──────────────────────────────────────────────────────────────

function SlotTooltip({ spool }: { spool: AmsSpoolSummary }) {
  const remaining = Math.max(0, spool.initial_weight - spool.used_weight)
  const fillPct = spool.initial_weight > 0 ? Math.round((remaining / spool.initial_weight) * 100) : 0
  const colorHex = spool.filament?.color_hex
  const label = spool.name ?? spool.filament?.name ?? null
  const material = spool.filament?.material ?? null
  const brandName = spool.brand?.name ?? null

  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 hidden group-hover:block w-48 rounded-lg border border-surface-border bg-surface-1 p-2.5 shadow-xl pointer-events-none text-left">
      <div className="flex items-center gap-1.5 mb-1">
        {colorHex && (
          <div className="h-3 w-3 shrink-0 rounded-full border border-black/20" style={{ backgroundColor: colorHex }} />
        )}
        <span className="text-xs font-semibold text-white truncate">{label ?? '—'}</span>
      </div>
      {brandName && <p className="text-xs text-gray-400">{brandName}</p>}
      {material && <p className="text-xs text-gray-400">{material}</p>}
      <div className="mt-2 h-1.5 w-full rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-primary-500" style={{ width: `${fillPct}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-500">{remaining.toFixed(0)} g · {fillPct}%</p>
      {spool.notes && (
        <p className="mt-1.5 border-t border-surface-border pt-1.5 text-xs text-gray-500 italic line-clamp-2">{spool.notes}</p>
      )}
    </div>
  )
}

function AmsUnitRow({
  unit, letter, canEdit, onAssign, onClear,
}: {
  unit: AmsUnit
  letter: string
  canEdit: boolean
  onAssign: (slotIndex: number, spoolId: number | null) => void
  onClear: (slotIndex: number) => void
}) {
  const slots = [...unit.slots].sort((a, b) => a.slot_index - b.slot_index)

  return (
    <div className="rounded-xl border border-surface-border bg-surface-2 p-3">
      <p className="mb-2.5 text-xs font-medium text-gray-400">{unit.name}</p>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((slot) => {
          const colorHex = slot.spool?.filament?.color_hex
          const label = slot.spool?.name ?? slot.spool?.filament?.name ?? null
          const material = slot.spool?.filament?.material ?? null
          const isEmpty = slot.spool_id === null
          const slotLabel = `${letter}${slot.slot_index + 1}`

          return (
            <div key={slot.slot_index} className="group relative">
              {!isEmpty && slot.spool && <SlotTooltip spool={slot.spool} />}

              <button
                onClick={() => canEdit && onAssign(slot.slot_index, slot.spool_id)}
                disabled={!canEdit}
                className={cn(
                  'relative flex h-16 w-full flex-col items-center justify-center rounded-lg border transition-all',
                  isEmpty
                    ? 'border-dashed border-surface-border bg-surface-3 text-gray-600'
                    : 'border-transparent',
                  canEdit && isEmpty && 'hover:border-primary-500 hover:text-primary-400 cursor-pointer',
                  canEdit && !isEmpty && 'cursor-pointer hover:brightness-110',
                  !canEdit && 'cursor-default',
                )}
                style={colorHex ? { backgroundColor: `${colorHex}22`, borderColor: `${colorHex}66` } : undefined}
              >
                {colorHex && (
                  <div
                    className="mb-1 h-4 w-4 rounded-full border border-black/20"
                    style={{ backgroundColor: colorHex }}
                  />
                )}
                {isEmpty ? (
                  <Plus className="h-4 w-4" />
                ) : (
                  <span className="px-1 text-center text-xs font-medium leading-tight text-white line-clamp-2">
                    {label ?? material ?? '—'}
                  </span>
                )}
                <span className="mt-0.5 text-xs font-semibold text-gray-400">{slotLabel}</span>
              </button>

              {canEdit && !isEmpty && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClear(slot.slot_index) }}
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white group-hover:flex"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── External / direct spool slot ──────────────────────────────────────────────

function ExternalSlot({
  spool, canEdit, onAssign, onClear, isPending,
}: {
  spool: PrinterResponse['direct_spool']
  canEdit: boolean
  onAssign: () => void
  onClear: () => void
  isPending: boolean
}) {
  if (!spool && !canEdit) return null

  const colorHex = spool?.filament?.color_hex
  const label = spool?.name ?? spool?.filament?.name ?? null
  const material = spool?.filament?.material ?? null

  return (
    <div className="rounded-xl border border-surface-border bg-surface-2 p-3">
      <p className="mb-2.5 text-xs font-medium text-gray-400">External</p>
      <div className="group relative w-1/4 min-w-[4rem]">
        {spool && <SlotTooltip spool={spool} />}

        <button
          onClick={() => canEdit && onAssign()}
          disabled={!canEdit || isPending}
          className={cn(
            'relative flex h-16 w-full flex-col items-center justify-center rounded-lg border transition-all',
            !spool
              ? 'border-dashed border-surface-border bg-surface-3 text-gray-600'
              : 'border-transparent',
            canEdit && !spool && 'hover:border-primary-500 hover:text-primary-400 cursor-pointer',
            canEdit && spool  && 'cursor-pointer hover:brightness-110',
            !canEdit && 'cursor-default',
          )}
          style={colorHex ? { backgroundColor: `${colorHex}22`, borderColor: `${colorHex}66` } : undefined}
        >
          {colorHex && (
            <div
              className="mb-1 h-4 w-4 rounded-full border border-black/20"
              style={{ backgroundColor: colorHex }}
            />
          )}
          {!spool ? (
            <Plus className="h-4 w-4" />
          ) : (
            <span className="px-1 text-center text-xs font-medium leading-tight text-white line-clamp-2">
              {label ?? material ?? '—'}
            </span>
          )}
          <span className="mt-0.5 text-xs font-semibold text-gray-400">Ext 1</span>
        </button>

        {canEdit && spool && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white group-hover:flex"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Spool picker modal ────────────────────────────────────────────────────────

function SpoolPickerModal({
  slotLabel, onSelect, onClose, isPending, assignedSpoolIds, currentSpoolId, moveTargets, onMoveToSlot,
}: {
  printerId: number
  slotLabel: string
  onSelect: (spoolId: number | null) => void
  onClose: () => void
  isPending: boolean
  assignedSpoolIds: Set<number>
  currentSpoolId: number | null
  moveTargets: { unitId: number; slotIndex: number; label: string }[]
  onMoveToSlot: (unitId: number, slotIndex: number) => void
}) {
  const { data } = useQuery({
    queryKey: ['spools', { status: 'active,storage', page_size: 100 }],
    queryFn: () => spoolsApi.list({ status: 'active,storage', page_size: 100 }),
  })
  const spools = (data?.items ?? []).filter(s => !assignedSpoolIds.has(s.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Assign spool — slot {slotLabel}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1">
          {/* Move to slot — shown when slot is occupied and empty targets exist */}
          {currentSpoolId !== null && moveTargets.length > 0 && (
            <div className="mb-1 pb-2 border-b border-surface-border">
              <p className="text-xs font-medium text-gray-500 mb-2">Move to slot</p>
              <div className="flex flex-wrap gap-1.5">
                {moveTargets.map(t => (
                  <button
                    key={`${t.unitId}-${t.slotIndex}`}
                    onClick={() => onMoveToSlot(t.unitId, t.slotIndex)}
                    disabled={isPending}
                    className="rounded-lg border border-surface-border bg-surface-2 px-3 py-1 text-sm font-medium text-white hover:border-primary-500 hover:bg-primary-500/10 transition-colors disabled:opacity-50"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Unassign */}
          {currentSpoolId !== null && (
            <button
              onClick={() => onSelect(null)}
              disabled={isPending}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-red-900/20 transition-colors text-red-400"
            >
              <div className="h-6 w-6 shrink-0 rounded-full border border-red-700/40 bg-red-900/30 flex items-center justify-center">
                <X className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">Unassign spool</span>
            </button>
          )}

          {/* Available spools */}
          {spools.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No unassigned active or storage spools.</p>
          ) : (
            spools.map((spool) => (
              <button
                key={spool.id}
                onClick={() => onSelect(spool.id)}
                disabled={isPending}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
              >
                <div
                  className="h-6 w-6 shrink-0 rounded-full border border-black/20"
                  style={{ backgroundColor: spool.filament?.color_hex ?? '#6366f1' }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">
                    {spool.name ?? spool.filament?.name ?? `Spool #${spool.id}`}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {spool.brand?.name} · {spool.filament?.material} · {spool.fill_percentage.toFixed(0)}% full
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
