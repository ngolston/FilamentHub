import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { brandsApi } from '@/api/brands'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import type { BrandResponse } from '@/types/api'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  website: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  country_of_origin: z.string().optional(),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  brand?: BrandResponse
  onClose: () => void
}

export function BrandFormModal({ brand, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = !!brand

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: brand?.name ?? '',
      website: brand?.website ?? '',
      country_of_origin: brand?.country_of_origin ?? '',
      notes: brand?.notes ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = { ...data, website: data.website || undefined }
      return isEdit ? brandsApi.update(brand.id, payload) : brandsApi.create(payload as Parameters<typeof brandsApi.create>[0])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit brand' : 'Add brand'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <Input label="Brand name" placeholder="Bambu Lab, PolyMaker, …" error={errors.name?.message} {...register('name')} />
          <Input label="Website" type="url" placeholder="https://example.com" error={errors.website?.message} {...register('website')} />
          <Input label="Country of origin" placeholder="China, Germany, …" {...register('country_of_origin')} />
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
              {isEdit ? 'Save changes' : 'Add brand'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
