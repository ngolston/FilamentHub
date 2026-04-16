import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/api/users'
import { useLocalSetting } from '@/hooks/useLocalSetting'
import { Button } from '@/components/ui/Button'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'

type WeightUnit   = 'g' | 'kg' | 'oz' | 'lb'
type TempUnit     = 'C' | 'F'
type DiameterUnit = 'mm' | 'in'
type DateFmt      = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'relative'
type FirstDay     = 'monday' | 'sunday'

const CURRENCIES  = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK']
const TIMEZONES   = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Madrid',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Kolkata',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
]

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-sm font-medium text-gray-300">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              value === opt.value
                ? 'rounded-lg px-3 py-1.5 text-sm font-medium bg-primary-600 text-white'
                : 'rounded-lg px-3 py-1.5 text-sm font-medium bg-surface-2 text-gray-300 hover:text-white border border-surface-border hover:border-gray-500 transition-colors'
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

export function UnitsSection() {
  const user    = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  // Server-synced
  const [weightUnit,  setWeightUnit]  = useLocalSetting<WeightUnit>('fh_weight_unit',   (user?.preferred_weight_unit as WeightUnit) ?? 'g')
  const [tempUnit,    setTempUnit]    = useLocalSetting<TempUnit>  ('fh_temp_unit',     (user?.preferred_temp_unit   as TempUnit)   ?? 'C')
  const [currency,    setCurrency]    = useLocalSetting            ('fh_currency',       user?.preferred_currency    ?? 'USD')
  const [timezone,    setTimezone]    = useLocalSetting            ('fh_timezone',       user?.timezone              ?? 'UTC')

  // Local-only
  const [diamUnit,    setDiamUnit]    = useLocalSetting<DiameterUnit>('fh_diam_unit',   'mm')
  const [dateFmt,     setDateFmt]     = useLocalSetting<DateFmt>     ('fh_date_fmt',    'MM/DD/YYYY')
  const [firstDay,    setFirstDay]    = useLocalSetting<FirstDay>    ('fh_first_day',   'monday')

  const mutation = useMutation({
    mutationFn: () => usersApi.updateMe({
      preferred_weight_unit: weightUnit,
      preferred_temp_unit:   tempUnit,
      preferred_currency:    currency,
      timezone,
    }),
    onSuccess: () => fetchMe(),
  })

  return (
    <div className="space-y-6">
      <SettingsCard title="Measurement" description="Units used for weights, temperatures, and filament diameter.">
        <div className="space-y-5">
          <PillGroup<WeightUnit>
            label="Weight"
            value={weightUnit}
            onChange={setWeightUnit}
            options={[
              { value: 'g',  label: 'Grams (g)'       },
              { value: 'kg', label: 'Kilograms (kg)'   },
              { value: 'oz', label: 'Ounces (oz)'      },
              { value: 'lb', label: 'Pounds (lb)'      },
            ]}
          />
          <PillGroup<TempUnit>
            label="Temperature"
            value={tempUnit}
            onChange={setTempUnit}
            options={[
              { value: 'C', label: '°C — Celsius'    },
              { value: 'F', label: '°F — Fahrenheit' },
            ]}
          />
          <PillGroup<DiameterUnit>
            label="Diameter"
            value={diamUnit}
            onChange={setDiamUnit}
            options={[
              { value: 'mm', label: 'mm' },
              { value: 'in', label: 'in' },
            ]}
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Locale & format" description="How dates, currency, and the calendar week are displayed.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-300">Date format</p>
            <div className="flex flex-wrap gap-1.5">
              {(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'relative'] as DateFmt[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setDateFmt(fmt)}
                  className={
                    dateFmt === fmt
                      ? 'rounded-lg px-3 py-1.5 text-sm font-medium bg-primary-600 text-white'
                      : 'rounded-lg px-3 py-1.5 text-sm font-medium bg-surface-2 text-gray-300 hover:text-white border border-surface-border transition-colors'
                  }
                >
                  {fmt === 'relative' ? 'Relative' : fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-300">First day of week</p>
            <div className="flex gap-1.5">
              {(['monday', 'sunday'] as FirstDay[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFirstDay(d)}
                  className={
                    firstDay === d
                      ? 'rounded-lg px-3 py-1.5 text-sm font-medium bg-primary-600 text-white'
                      : 'rounded-lg px-3 py-1.5 text-sm font-medium bg-surface-2 text-gray-300 hover:text-white border border-surface-border transition-colors'
                  }
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <SelectField
            label="Currency"
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES}
          />

          <SelectField
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
            options={TIMEZONES}
          />
        </div>
      </SettingsCard>

      {mutation.error && (
        <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
          {getErrorMessage(mutation.error)}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="rounded-lg bg-green-900/40 border border-green-700/50 px-3 py-2 text-sm text-green-300">
          Preferences saved.
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          Save preferences
        </Button>
      </div>
    </div>
  )
}
