import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown, Printer as PrinterIcon, Pencil, Trash2,
  Wifi, WifiOff, Plus, X, Layers,
} from 'lucide-react'
import { printersApi } from '@/api/printers'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatRelative } from '@/utils/format'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/utils/cn'
import { AmsGrid } from './AmsGrid'
import { PrinterFormModal } from './PrinterFormModal'
import type { PrinterResponse, PrinterStatus } from '@/types/api'

const STATUS_BADGE: Record<PrinterStatus, 'success' | 'accent' | 'warning' | 'danger' | 'default'> = {
  idle:     'success',
  printing: 'accent',
  paused:   'warning',
  error:    'danger',
  offline:  'default',
}

const CONNECTION_LABEL: Record<string, string> = {
  manual:    'Manual',
  bambu:     'Bambu Lab',
  octoprint: 'OctoPrint',
  moonraker: 'Moonraker',
}

// ── Add AMS dialog ────────────────────────────────────────────────────────────

function AddAmsDialog({
  printers,
  onClose,
}: {
  printers: PrinterResponse[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | ''>(
    printers.length === 1 ? printers[0].id : ''
  )

  const addUnit = useMutation({
    mutationFn: (printerId: number) => printersApi.addAmsUnit(printerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Add AMS unit</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-gray-400">
          Select which printer to attach the new AMS unit to.
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-300">Printer</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
          >
            <option value="">— Select a printer —</option>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.model ? ` (${p.model})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedId !== '' && (() => {
          const p = printers.find((pr) => pr.id === selectedId)
          if (!p) return null
          const nextLetter = String.fromCharCode(65 + p.ams_units.length)
          return (
            <p className="text-xs text-gray-500">
              Will be added as AMS unit <span className="text-gray-300 font-medium">{nextLetter}</span>
              {' '}({nextLetter}1–{nextLetter}4)
            </p>
          )
        })()}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={selectedId === ''}
            loading={addUnit.isPending}
            onClick={() => selectedId !== '' && addUnit.mutate(selectedId)}
          >
            Add AMS
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Add Device dropdown button ────────────────────────────────────────────────

function AddDeviceButton({
  onAddPrinter,
  onAddAms,
}: {
  onAddPrinter: () => void
  onAddAms: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function toggle() {
    setOpen((v) => {
      if (!v) {
        setTimeout(() => {
          const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
              setOpen(false)
              window.removeEventListener('mousedown', close)
            }
          }
          window.addEventListener('mousedown', close)
        }, 0)
      }
      return !v
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add device
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-surface-border bg-surface-1 shadow-2xl py-1 z-20">
          <button
            onClick={() => { setOpen(false); onAddPrinter() }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors"
          >
            <PrinterIcon className="h-3.5 w-3.5 text-gray-500" />
            Add printer
          </button>
          <button
            onClick={() => { setOpen(false); onAddAms() }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors"
          >
            <Layers className="h-3.5 w-3.5 text-gray-500" />
            Add AMS
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PrintersPage() {
  const { isEditor } = useAuth()
  const queryClient = useQueryClient()
  const [showPrinterForm, setShowPrinterForm] = useState(false)
  const [showAmsDialog,   setShowAmsDialog]   = useState(false)
  const [editing,         setEditing]         = useState<PrinterResponse | null>(null)
  const [confirmDelete,   setConfirmDelete]   = useState<PrinterResponse | null>(null)

  const { data: printers = [], isLoading } = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => printersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      setConfirmDelete(null)
    },
  })

  const totalAms = printers.reduce((n, p) => n + p.ams_units.length, 0)

  return (
    <div className="p-5 lg:p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Devices</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            {printers.length} printer{printers.length !== 1 ? 's' : ''}
            {totalAms > 0 && ` · ${totalAms} AMS unit${totalAms !== 1 ? 's' : ''}`}
          </p>
        </div>
        {isEditor && (
          <AddDeviceButton
            onAddPrinter={() => setShowPrinterForm(true)}
            onAddAms={() => setShowAmsDialog(true)}
          />
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : printers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <PrinterIcon className="h-12 w-12 text-gray-600" />
          <p className="text-sm text-gray-400">No devices yet.</p>
          {isEditor && (
            <Button size="sm" variant="secondary" onClick={() => setShowPrinterForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add your first printer
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {printers.map((printer) => (
            <PrinterCard
              key={printer.id}
              printer={printer}
              canEdit={isEditor}
              onEdit={() => setEditing(printer)}
              onDelete={() => setConfirmDelete(printer)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit printer modal */}
      {(showPrinterForm || editing) && (
        <PrinterFormModal
          printer={editing ?? undefined}
          onClose={() => { setShowPrinterForm(false); setEditing(null) }}
        />
      )}

      {/* Add AMS dialog */}
      {showAmsDialog && (
        <AddAmsDialog
          printers={printers}
          onClose={() => setShowAmsDialog(false)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Delete printer?</h3>
            <p className="mt-2 text-sm text-gray-400">
              <span className="font-medium text-white">{confirmDelete.name}</span> and all its AMS
              units will be permanently removed. Print job history will be preserved.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Printer card ──────────────────────────────────────────────────────────────

function PrinterCard({
  printer, canEdit, onEdit, onDelete,
}: {
  printer: PrinterResponse
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const isOnline = printer.status !== 'offline'
  const isBambu  = printer.connection_type === 'bambu'

  return (
    <Card className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3">
            <PrinterIcon className="h-5 w-5 text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white leading-tight truncate">{printer.name}</p>
            {printer.model && (
              <p className="text-xs text-gray-500 truncate">{printer.model}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant={STATUS_BADGE[printer.status as PrinterStatus]}>
            {printer.status}
          </Badge>
          {canEdit && (
            <>
              <button
                onClick={onEdit}
                className="rounded-md p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="rounded-md p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          {isOnline
            ? <Wifi className="h-3 w-3 text-accent-400" />
            : <WifiOff className="h-3 w-3" />}
          {CONNECTION_LABEL[printer.connection_type] ?? printer.connection_type}
        </span>
        {printer.api_url && (
          <span className={cn('font-mono', isBambu ? 'text-gray-400' : 'text-gray-500 truncate max-w-[160px]')}>
            {isBambu ? printer.api_url : printer.api_url}
          </span>
        )}
        {isBambu && printer.serial_number && (
          <span className="text-gray-600">S/N: {printer.serial_number}</span>
        )}
        {printer.last_seen_at && (
          <span>· last seen {formatRelative(printer.last_seen_at)}</span>
        )}
      </div>

      {/* AMS grid (includes External slot) */}
      <AmsGrid printer={printer} canEdit={canEdit} />
    </Card>
  )
}
