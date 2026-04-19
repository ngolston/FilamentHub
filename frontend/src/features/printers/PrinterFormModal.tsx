import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { printersApi } from '@/api/printers'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import type { PrinterResponse, PrinterConnectionType } from '@/types/api'

const schema = z.object({
  name:            z.string().min(1, 'Name is required'),
  model:           z.string().optional(),
  serial_number:   z.string().optional(),
  connection_type: z.enum(['octoprint', 'moonraker', 'bambu', 'manual']),
  api_url:         z.string().optional(),
  api_key:         z.string().optional(),
  notes:           z.string().optional(),
})
type FormData = z.infer<typeof schema>

const CONNECTION_TYPES: { value: PrinterConnectionType; label: string }[] = [
  { value: 'manual',     label: 'Manual' },
  { value: 'bambu',      label: 'Bambu Lab' },
  { value: 'octoprint',  label: 'OctoPrint' },
  { value: 'moonraker',  label: 'Moonraker / Klipper' },
]

interface Props {
  printer?: PrinterResponse
  onClose:  () => void
}

export function PrinterFormModal({ printer, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = !!printer

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:            printer?.name            ?? '',
      model:           printer?.model           ?? '',
      serial_number:   printer?.serial_number   ?? '',
      connection_type: (printer?.connection_type as PrinterConnectionType) ?? 'manual',
      api_url:         printer?.api_url ?? (printer?.connection_type === 'bambu' ? '' : ''),
      api_key:         '',
      notes:           printer?.notes ?? '',
    },
  })

  const connectionType = watch('connection_type')
  const isBambu  = connectionType === 'bambu'
  const needsApi = connectionType !== 'manual'

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        model:         data.model         || undefined,
        serial_number: data.serial_number || undefined,
        api_url:       data.api_url       || undefined,
        api_key:       data.api_key       || undefined,
        notes:         data.notes         || undefined,
      }
      return isEdit
        ? printersApi.update(printer.id, payload)
        : printersApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit printer' : 'Add printer'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          {/* Name + Model */}
          <Input label="Printer name" placeholder="My Bambu X1C" error={errors.name?.message} {...register('name')} />
          <Input label="Model" placeholder="X1 Carbon, MK4, Ender 3…" {...register('model')} />

          {/* Connection type */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Connection type</label>
            <select
              {...register('connection_type')}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
            >
              {CONNECTION_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Connection fields — vary by type */}
          {needsApi && (
            <div className="rounded-lg border border-surface-border bg-surface-2/40 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {isBambu ? 'Bambu Lab connection' : 'Network connection'}
              </p>

              <Input
                label={isBambu ? 'IP Address' : 'API URL'}
                placeholder={isBambu ? '192.168.1.x' : 'http://192.168.1.x'}
                {...register('api_url')}
              />

              {isBambu && (
                <Input
                  label="Serial number"
                  placeholder="01P00A123456789"
                  {...register('serial_number')}
                />
              )}

              <Input
                label={isBambu ? 'Access code' : 'API key'}
                placeholder={isBambu ? 'Found in printer settings' : 'Optional'}
                {...register('api_key')}
              />

              {isBambu && (
                <p className="text-xs text-gray-600">
                  IP address and access code are found in your printer's Settings → Network → Network Info.
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Notes</label>
            <textarea
              {...register('notes')}
              rows={2}
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none resize-none"
              placeholder="Optional"
            />
          </div>

          {mutation.error && (
            <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
              {getErrorMessage(mutation.error)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>
              {isEdit ? 'Save changes' : 'Add printer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
