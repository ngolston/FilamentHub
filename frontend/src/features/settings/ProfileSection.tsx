import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'

const WEIGHT_UNITS = ['g', 'kg']
const TEMP_UNITS   = ['C', 'F']
const CURRENCIES   = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']
const TIMEZONES    = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai',
  'Australia/Sydney', 'Australia/Melbourne',
]

const schema = z.object({
  display_name:          z.string().min(1, 'Required'),
  maker_name:            z.string().optional(),
  preferred_weight_unit: z.string(),
  preferred_temp_unit:   z.string(),
  preferred_currency:    z.string(),
  timezone:              z.string(),
})
type FormData = z.infer<typeof schema>

export function ProfileSection() {
  const user    = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name:          user?.display_name ?? '',
      maker_name:            user?.maker_name   ?? '',
      preferred_weight_unit: user?.preferred_weight_unit ?? 'g',
      preferred_temp_unit:   user?.preferred_temp_unit   ?? 'C',
      preferred_currency:    user?.preferred_currency    ?? 'USD',
      timezone:              user?.timezone              ?? 'UTC',
    },
  })

  const mutation = useMutation({
    mutationFn: usersApi.updateMe,
    onSuccess: () => fetchMe(),
  })

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
      <SettingsCard title="Profile" description="Your public identity on FilamentHub.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Display name"
            error={errors.display_name?.message}
            {...register('display_name')}
          />
          <Input
            label="Maker name"
            placeholder="Optional community handle"
            {...register('maker_name')}
          />
        </div>

        <div className="rounded-lg border border-surface-border bg-surface-2 px-4 py-3">
          <p className="text-xs text-gray-500">Email</p>
          <p className="mt-0.5 text-sm text-white">{user?.email}</p>
        </div>

        <div className="rounded-lg border border-surface-border bg-surface-2 px-4 py-3">
          <p className="text-xs text-gray-500">Role</p>
          <p className="mt-0.5 text-sm capitalize text-white">{user?.role}</p>
        </div>
      </SettingsCard>

      <SettingsCard title="Preferences" description="Units and locale used throughout the app.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Weight unit" {...register('preferred_weight_unit')}>
            {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </SelectField>

          <SelectField label="Temperature unit" {...register('preferred_temp_unit')}>
            {TEMP_UNITS.map((u) => <option key={u} value={u}>°{u}</option>)}
          </SelectField>

          <SelectField label="Currency" {...register('preferred_currency')}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelectField>

          <SelectField label="Timezone" {...register('timezone')}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </SelectField>
        </div>
      </SettingsCard>

      {mutation.error && (
        <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
          {getErrorMessage(mutation.error)}
        </p>
      )}

      {mutation.isSuccess && (
        <p className="rounded-lg bg-green-900/40 border border-green-700/50 px-3 py-2 text-sm text-green-300">
          Profile updated.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty} loading={mutation.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  )
}

function SelectField({
  label, children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <select
        {...props}
        className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
      >
        {children}
      </select>
    </div>
  )
}
