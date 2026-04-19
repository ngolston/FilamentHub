import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { printersApi } from '@/api/printers'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import type { AmsUnit, PrinterResponse } from '@/types/api'


interface AmsGridProps {
  printer: PrinterResponse
  canEdit: boolean
}

export function AmsGrid({ printer, canEdit }: AmsGridProps) {
  const queryClient = useQueryClient()
  const [assigningSlot, setAssigningSlot] = useState<
    | { type: 'ams'; unitId: number; slotIndex: number }
    | { type: 'direct' }
    | null
  >(null)

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
            onAssign={(slotIndex) => setAssigningSlot({ type: 'ams', unitId: unit.id, slotIndex })}
            onClear={(slotIndex) => assignSlot.mutate({ unitId: unit.id, slotIndex, spoolId: null })}
          />
        )
      })}

      {/* External / direct spool */}
      <ExternalSlot
        spool={printer.direct_spool}
        canEdit={canEdit}
        onAssign={() => setAssigningSlot({ type: 'direct' })}
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
          onSelect={(spoolId) => {
            if (assigningSlot.type === 'direct') {
              assignDirect.mutate(spoolId)
            } else {
              assignSlot.mutate({ unitId: assigningSlot.unitId, slotIndex: assigningSlot.slotIndex, spoolId })
            }
          }}
          onClose={() => setAssigningSlot(null)}
          isPending={assignSlot.isPending || assignDirect.isPending}
        />
      )}
    </div>
  )
}

// ── AMS unit row ──────────────────────────────────────────────────────────────

function AmsUnitRow({
  unit, letter, canEdit, onAssign, onClear,
}: {
  unit: AmsUnit
  letter: string
  canEdit: boolean
  onAssign: (slotIndex: number) => void
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
              <button
                onClick={() => canEdit && onAssign(slot.slot_index)}
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
  slotLabel, onSelect, onClose, isPending,
}: {
  printerId: number
  slotLabel: string
  onSelect: (spoolId: number) => void
  onClose: () => void
  isPending: boolean
}) {
  const { data } = useQuery({
    queryKey: ['spools', { status: 'active,storage', page_size: 100 }],
    queryFn: () => spoolsApi.list({ status: 'active,storage', page_size: 100 }),
  })
  const spools = data?.items ?? []

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

        {spools.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No active or storage spools found.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {spools.map((spool) => (
              <li key={spool.id}>
                <button
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
