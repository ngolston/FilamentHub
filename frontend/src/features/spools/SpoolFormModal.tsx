import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Search, Trash2, Upload, X } from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { filamentsApi } from '@/api/filaments'
import { brandsApi } from '@/api/brands'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import type { SpoolResponse, FilamentProfileResponse } from '@/types/api'

const schema = z.object({
  filament_id:    z.coerce.number().optional(),
  brand_id:       z.coerce.number().optional(),
  name:           z.string().optional(),
  lot_nr:         z.string().optional(),
  initial_weight: z.coerce.number().positive('Required'),
  spool_weight:   z.coerce.number().min(0).optional(),
  used_weight:    z.coerce.number().min(0).optional(),
  status:         z.enum(['active', 'storage', 'archived']),
  purchase_date:  z.string().optional(),
  purchase_price: z.coerce.number().min(0).optional(),
  supplier:       z.string().optional(),
  product_url:    z.string().url().optional().or(z.literal('')),
  notes:          z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  spool?:             SpoolResponse
  prefillFilamentId?: number
  onClose:            () => void
}

// ── Filament picker ───────────────────────────────────────────────────────────

function FilamentPicker({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (id: number | undefined, filament: FilamentProfileResponse | undefined) => void
}) {
  const [search, setSearch] = useState('')

  const { data } = useQuery({
    queryKey: ['filaments', 'picker'],
    queryFn: () => filamentsApi.list({ page_size: 200 }),
  })

  const all = data?.items ?? []
  const filtered = search
    ? all.filter((f) => {
        const q = search.toLowerCase()
        return (
          f.name.toLowerCase().includes(q) ||
          f.material.toLowerCase().includes(q) ||
          (f.brand?.name ?? '').toLowerCase().includes(q)
        )
      })
    : all

  const selected = all.find((f) => f.id === value)

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-300">Filament profile</label>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, material or brand…"
          className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {/* Scrollable list */}
      <div className="max-h-44 overflow-y-auto rounded-lg border border-surface-border bg-surface-2 divide-y divide-surface-border">
        {/* None option */}
        <button
          type="button"
          onClick={() => onChange(undefined, undefined)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            !value ? 'bg-primary-600/20 text-primary-300' : 'text-gray-400 hover:bg-surface-3 hover:text-white'
          }`}
        >
          <span className="italic">— No filament profile —</span>
        </button>

        {filtered.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id, f)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
              value === f.id ? 'bg-primary-600/20 text-white' : 'hover:bg-surface-3'
            }`}
          >
            <div
              className="h-4 w-4 shrink-0 rounded border border-white/10"
              style={{ backgroundColor: f.color_hex ?? '#374151' }}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-white truncate">{f.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {f.brand?.name ? `${f.brand.name} · ` : ''}{f.material}
                {f.diameter ? ` · ${f.diameter}mm` : ''}
              </span>
            </div>
            {value === f.id && (
              <span className="shrink-0 text-xs text-primary-400">✓</span>
            )}
          </button>
        ))}

        {filtered.length === 0 && (
          <p className="px-3 py-3 text-sm text-gray-500 text-center">No matches</p>
        )}
      </div>

      {selected && (
        <p className="text-xs text-gray-500">
          Selected: <span className="text-gray-300">{selected.brand?.name ? `${selected.brand.name} — ` : ''}{selected.name}</span>
        </p>
      )}
    </div>
  )
}

// ── Photo upload section ──────────────────────────────────────────────────────

function PhotoSection({
  spoolId,
  currentUrl,
  pendingFile,
  onPendingChange,
}: {
  spoolId: number | undefined
  currentUrl: string | null | undefined
  pendingFile: File | null
  onPendingChange: (f: File | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => spoolsApi.uploadPhoto(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spools'] }),
  })

  const previewUrl = pendingFile
    ? URL.createObjectURL(pendingFile)
    : currentUrl ?? null

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) return
    onPendingChange(file)
    // If editing an existing spool, upload immediately
    if (spoolId) {
      uploadMutation.mutate({ id: spoolId, file })
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Photo</p>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div
          className="relative h-24 w-24 shrink-0 cursor-pointer rounded-xl border border-surface-border bg-surface-2 overflow-hidden flex items-center justify-center"
          onClick={() => fileRef.current?.click()}
          title="Click to upload photo"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Spool" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-8 w-8 text-gray-600" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
            <Upload className="h-5 w-5 text-white" />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors text-left"
          >
            {previewUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={() => onPendingChange(null)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-colors text-left"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          )}
          {uploadMutation.isPending && (
            <p className="text-xs text-gray-500">Uploading…</p>
          )}
          {uploadMutation.isSuccess && (
            <p className="text-xs text-green-400">Photo saved</p>
          )}
          {uploadMutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(uploadMutation.error)}</p>
          )}
          <p className="text-xs text-gray-600">JPEG, PNG or WebP. Max 10 MB.</p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

// ── Form section wrapper ──────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      {children}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function SpoolFormModal({ spool, prefillFilamentId, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = !!spool

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: brandsApi.list,
  })

  const defaultFilamentId = spool?.filament?.id ?? prefillFilamentId
  const [filamentId, setFilamentId] = useState<number | undefined>(defaultFilamentId)
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      filament_id:    defaultFilamentId,
      brand_id:       spool?.brand?.id,
      name:           spool?.name           ?? '',
      lot_nr:         spool?.lot_nr         ?? '',
      initial_weight: spool?.initial_weight ?? 1000,
      spool_weight:   spool?.spool_weight   ?? undefined,
      used_weight:    spool?.used_weight    ?? 0,
      status:         spool?.status         ?? 'storage',
      purchase_date:  spool?.purchase_date  ?? '',
      purchase_price: spool?.purchase_price ?? undefined,
      supplier:       spool?.supplier       ?? '',
      product_url:    spool?.product_url    ?? '',
      notes:          spool?.notes          ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        filament_id:    data.filament_id    || undefined,
        brand_id:       data.brand_id       || undefined,
        name:           data.name           || undefined,
        lot_nr:         data.lot_nr         || undefined,
        spool_weight:   data.spool_weight   ?? undefined,
        purchase_date:  data.purchase_date  || undefined,
        purchase_price: data.purchase_price ?? undefined,
        supplier:       data.supplier       || undefined,
        product_url:    data.product_url    || undefined,
        notes:          data.notes          || undefined,
      }
      const saved = isEdit
        ? await spoolsApi.update(spool.id, payload)
        : await spoolsApi.create(payload as Parameters<typeof spoolsApi.create>[0])
      // Upload pending photo on create (edit uploads immediately on file select)
      if (!isEdit && pendingPhoto) {
        await spoolsApi.uploadPhoto(saved.id, pendingPhoto)
      }
      return saved
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit spool' : 'Add spool'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">

          {/* Photo */}
          <PhotoSection
            spoolId={isEdit ? spool.id : undefined}
            currentUrl={spool?.photo_url}
            pendingFile={pendingPhoto}
            onPendingChange={setPendingPhoto}
          />

          {/* Filament profile picker */}
          <Section label="Filament">
            <FilamentPicker
              value={filamentId}
              onChange={(id) => {
                setFilamentId(id)
                setValue('filament_id', id)
              }}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Brand override</label>
                <select
                  {...register('brand_id')}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                >
                  <option value="">— From filament —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Status</label>
                <select
                  {...register('status')}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="storage">Storage</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <Input label="Custom name" placeholder="Optional — overrides filament name" {...register('name')} />
          </Section>

          {/* Weight */}
          <Section label="Weight">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Input
                  label="Initial (g)"
                  type="number"
                  step="1"
                  placeholder="1000"
                  error={errors.initial_weight?.message}
                  {...register('initial_weight')}
                />
              </div>
              <div className="col-span-1">
                <Input
                  label="Empty spool weight (g)"
                  type="number"
                  step="1"
                  placeholder="~250"
                  {...register('spool_weight')}
                />
              </div>
              <div className="col-span-1">
                <Input
                  label="Used (g)"
                  type="number"
                  step="1"
                  placeholder="0"
                  {...register('used_weight')}
                />
              </div>
            </div>
            <p className="text-xs text-gray-600">
              Initial weight is the filament only (no spool). Leave used at 0 for a brand-new spool.
            </p>
          </Section>

          {/* Tracking */}
          <Section label="Tracking">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Lot / batch number" placeholder="Optional" {...register('lot_nr')} />
              <Input label="Purchase date" type="date" {...register('purchase_date')} />
              <Input label="Purchase price" type="number" step="0.01" placeholder="0.00" {...register('purchase_price')} />
              <Input label="Supplier" placeholder="Amazon, local shop…" {...register('supplier')} />
            </div>
            <Input label="Product URL" type="url" placeholder="https://…" {...register('product_url')} />
          </Section>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Notes</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Optional"
              className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none resize-none"
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
              {isEdit ? 'Save changes' : 'Add spool'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
