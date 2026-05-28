import { useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, X } from 'lucide-react'
import { filamentsApi } from '@/api/filaments'
import { brandsApi } from '@/api/brands'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import type { FilamentProfileResponse } from '@/types/api'

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'HIPS', 'PVA', 'PLA-CF', 'PETG-CF', 'ABS-CF', 'Other']

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  material: z.string().min(1, 'Material is required'),
  brand_id: z.coerce.number().optional(),
  color_name: z.string().optional(),
  // Accept with or without leading #; normalize to always include it
  color_hex: z.string()
    .transform((v) => {
      if (!v) return ''
      return v.startsWith('#') ? v : `#${v}`
    })
    .pipe(
      z.string()
        .regex(/^(#[0-9a-fA-F]{6})?$/, 'Must be a 6-digit hex colour, e.g. 4f46e5')
        .optional()
        .or(z.literal(''))
    )
    .optional()
    .or(z.literal('')),
  diameter: z.coerce.number().positive().optional(),
  density: z.coerce.number().positive().optional(),
  print_temp_min: z.coerce.number().optional(),
  print_temp_max: z.coerce.number().optional(),
  bed_temp_min: z.coerce.number().optional(),
  bed_temp_max: z.coerce.number().optional(),
  drying_temp: z.coerce.number().optional(),
  drying_duration: z.coerce.number().optional(),
  product_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  filament?: FilamentProfileResponse
  onClose: () => void
}

export function FilamentFormModal({ filament, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = !!filament

  const [photoFile, setPhotoFile]     = useState<File | null>(null)
  const [photoUrl,  setPhotoUrl]      = useState(filament?.photo_url ?? '')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(),
  })

  const { register, handleSubmit, watch, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:         filament?.name ?? '',
      material:     filament?.material ?? 'PLA',
      brand_id:     filament?.brand?.id,
      color_name:   filament?.color_name ?? '',
      // Strip # for the input display; the schema normalizes it back
      color_hex:    filament?.color_hex?.replace(/^#/, '') ?? '',
      diameter:     filament?.diameter ?? 1.75,
      density:      filament?.density ?? undefined,
      print_temp_min:  filament?.print_temp_min ?? undefined,
      print_temp_max:  filament?.print_temp_max ?? undefined,
      bed_temp_min:    filament?.bed_temp_min ?? undefined,
      bed_temp_max:    filament?.bed_temp_max ?? undefined,
      drying_temp:     filament?.drying_temp ?? undefined,
      drying_duration: filament?.drying_duration ?? undefined,
      product_url:  filament?.product_url ?? '',
      notes:        filament?.notes ?? '',
    },
  })

  // Live hex for the swatch preview — normalise on the fly
  const rawHex = watch('color_hex') ?? ''
  const previewHex = /^#?[0-9a-fA-F]{6}$/.test(rawHex)
    ? (rawHex.startsWith('#') ? rawHex : `#${rawHex}`)
    : null

  function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
    setPhotoUrl('')
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        color_hex:   data.color_hex || undefined,
        product_url: data.product_url || undefined,
        brand_id:    data.brand_id || undefined,
        photo_url:   !photoFile ? (photoUrl || undefined) : undefined,
      }
      const saved = isEdit
        ? await filamentsApi.update(filament.id, payload)
        : await filamentsApi.create(payload as Parameters<typeof filamentsApi.create>[0])

      if (photoFile) await filamentsApi.uploadPhoto(saved.id, photoFile)
      return saved
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filaments'] })
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit filament' : 'Add filament'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">

          {/* Basic info */}
          <Section label="Basic info">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name" placeholder="Matte PLA, Silk Gold, …" error={errors.name?.message} {...register('name')} />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Material</label>
                <select
                  {...register('material')}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                >
                  {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Brand</label>
                <select
                  {...register('brand_id')}
                  className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                >
                  <option value="">— No brand —</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <Input
                label="Diameter (mm)"
                type="number"
                step="0.01"
                placeholder="1.75"
                {...register('diameter')}
              />
            </div>
          </Section>

          {/* Colour */}
          <Section label="Colour">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Colour name" placeholder="Bambu Green, Galaxy Black, …" {...register('color_name')} />

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-300">Hex colour</label>
                <div className="flex items-center gap-2">
                  {/* Live swatch */}
                  <div
                    className="h-9 w-9 shrink-0 rounded-lg border border-surface-border transition-colors"
                    style={{ backgroundColor: previewHex ?? '#374151' }}
                  />
                  {/* # prefix + hex-only input */}
                  <Controller
                    name="color_hex"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-1 overflow-hidden rounded-lg border border-surface-border focus-within:border-primary-500">
                        <span className="flex items-center px-2 text-gray-400 bg-surface-3 text-sm select-none border-r border-surface-border">
                          #
                        </span>
                        <input
                          value={(field.value ?? '').replace(/^#/, '')}
                          onChange={(e) => {
                            // Strip any accidental # the user pastes, keep only hex chars
                            const clean = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                            field.onChange(clean)
                          }}
                          placeholder="1a2b3c"
                          maxLength={6}
                          className="flex-1 bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none font-mono"
                        />
                      </div>
                    )}
                  />
                </div>
                {errors.color_hex && <p className="text-xs text-red-400">{errors.color_hex.message}</p>}
              </div>
            </div>
          </Section>

          {/* Photo */}
          <Section label="Photo">
            {/* File drop / click area */}
            {(photoPreview || photoUrl) ? (
              <div className="relative w-full h-36 rounded-xl overflow-hidden border border-surface-border">
                <img
                  src={photoPreview ?? photoUrl}
                  alt="Filament photo"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoUrl('') }}
                  className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white hover:bg-black transition-colors backdrop-blur-sm"
                >
                  Change photo
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 h-28 w-full rounded-xl border-2 border-dashed border-surface-border cursor-pointer hover:border-gray-600 bg-surface-2 transition-colors"
              >
                <Upload className="h-6 w-6 text-gray-500" />
                <p className="text-sm text-gray-400">
                  Drop or <span className="text-primary-400">click to upload</span>
                </p>
                <p className="text-xs text-gray-600">JPEG · PNG · WebP</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f) }}
            />

            {/* URL fallback */}
            <div className="flex flex-col gap-1 mt-2">
              <label className="text-xs text-gray-500">Or enter a photo URL</label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => { setPhotoUrl(e.target.value); if (e.target.value) { setPhotoFile(null); setPhotoPreview(null) } }}
                placeholder="https://example.com/photo.jpg"
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
              />
            </div>
          </Section>

          {/* Print settings */}
          <Section label="Print settings">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Print temp min (°C)" type="number" placeholder="190" {...register('print_temp_min')} />
              <Input label="Print temp max (°C)" type="number" placeholder="220" {...register('print_temp_max')} />
              <Input label="Bed temp min (°C)" type="number" placeholder="55" {...register('bed_temp_min')} />
              <Input label="Bed temp max (°C)" type="number" placeholder="65" {...register('bed_temp_max')} />
            </div>
          </Section>

          {/* Drying */}
          <Section label="Drying">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Drying temp (°C)" type="number" placeholder="55" {...register('drying_temp')} />
              <Input label="Drying duration (hrs)" type="number" placeholder="6" {...register('drying_duration')} />
            </div>
          </Section>

          {/* Optional */}
          <Section label="Optional">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Density (g/cm³)" type="number" step="0.01" placeholder="1.24" {...register('density')} />
              <Input label="Product URL" type="url" placeholder="https://…" {...register('product_url')} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Notes</label>
              <textarea
                {...register('notes')}
                rows={2}
                className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none resize-none"
                placeholder="Optional"
              />
            </div>
          </Section>

          {mutation.error && (
            <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
              {getErrorMessage(mutation.error)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>
              {isEdit ? 'Save changes' : 'Add filament'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      {children}
    </div>
  )
}
