import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Printer, Pencil, Trash2, Wifi, WifiOff } from 'lucide-react'
import { printersApi } from '@/api/printers'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatRelative } from '@/utils/format'
import { useAuth } from '@/hooks/useAuth'
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

export default function PrintersPage() {
  const { isEditor } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PrinterResponse | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PrinterResponse | null>(null)

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

  return (
    <div className="p-5 lg:p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Printers</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            {printers.length} printer{printers.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        {isEditor && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add printer
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : printers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Printer className="h-12 w-12 text-gray-600" />
          <p className="text-sm text-gray-400">No printers yet.</p>
          {isEditor && (
            <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
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

      {/* Add / Edit modal */}
      {(showForm || editing) && (
        <PrinterFormModal
          printer={editing ?? undefined}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Delete printer?</h3>
            <p className="mt-2 text-sm text-gray-400">
              <span className="font-medium text-white">{confirmDelete.name}</span> will be permanently removed.
              Print job history linked to it will be preserved.
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

function PrinterCard({
  printer, canEdit, onEdit, onDelete,
}: {
  printer: PrinterResponse
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const isOnline = printer.status !== 'offline'

  return (
    <Card className="flex flex-col gap-0">
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3">
            <Printer className="h-5 w-5 text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white leading-tight">{printer.name}</p>
            {printer.model && (
              <p className="text-xs text-gray-500">{printer.model}</p>
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
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="rounded-md p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          {isOnline
            ? <Wifi className="h-3 w-3 text-accent-400" />
            : <WifiOff className="h-3 w-3" />}
          {CONNECTION_LABEL[printer.connection_type] ?? printer.connection_type}
        </span>
        {printer.last_seen_at && (
          <span>· last seen {formatRelative(printer.last_seen_at)}</span>
        )}
      </div>

      {/* AMS grid */}
      <AmsGrid printer={printer} canEdit={canEdit} />
    </Card>
  )
}
