import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Thermometer, Weight, MapPin, Palette, Package } from 'lucide-react'
import { publicApi } from '@/api/public'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-100">{children}</span>
    </div>
  )
}

function TempRange({ min, max }: { min: number | null | undefined; max: number | null | undefined }) {
  if (!min && !max) return <>—</>
  return <>{min && max ? `${min}–${max}°C` : min ? `${min}°C` : `${max}°C`}</>
}

export default function PublicSpoolPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const spoolId = Number(id)

  const { data: spool, isLoading, isError } = useQuery({
    queryKey: ['public', 'spool', spoolId],
    queryFn: () => publicApi.getSpool(spoolId),
    enabled: !isNaN(spoolId),
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-indigo-400" />
      </div>
    )
  }

  if (isError || !spool) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 gap-4">
        <Package className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Spool not found</p>
      </div>
    )
  }

  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const name    = spool.name ?? fp?.name ?? 'Unnamed Spool'
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? null
  const mat     = fp?.material ?? null
  const diameter = fp?.diameter ?? null

  function handleEdit() {
    const target = `/spools/${spool.id}/edit`
    navigate(`/login?redirect=${encodeURIComponent(target)}`)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div
        className="w-full py-6 px-4 flex flex-col items-center gap-3"
        style={{ backgroundColor: hex ? `${hex}22` : '#1f2937' }}
      >
        {hex && (
          <div
            className="h-12 w-12 rounded-full border-4 border-white/20 shadow-lg"
            style={{ backgroundColor: hex }}
          />
        )}
        <div className="text-center">
          {brand && <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{brand}</p>}
          <h1 className="text-xl font-bold text-white">{name}</h1>
          {mat && (
            <p className="text-sm text-gray-400 mt-0.5">
              {mat}{diameter ? ` · ${diameter}mm` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-md w-full mx-auto px-4 py-6 space-y-6">

        {/* Fill indicator */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Remaining</span>
            <span className="text-white font-semibold tabular-nums">
              {spool.remaining_weight.toFixed(0)}g / {spool.initial_weight.toFixed(0)}g
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, spool.fill_percentage)}%`,
                backgroundColor: hex ?? '#6366f1',
              }}
            />
          </div>
          <p className="text-right text-xs text-gray-500 tabular-nums">
            {spool.fill_percentage.toFixed(0)}% full
          </p>
        </div>

        {/* Data grid */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 grid grid-cols-2 gap-x-6 gap-y-4">
          {(fp?.print_temp_min || fp?.print_temp_max) && (
            <Field label="Nozzle Temp">
              <span className="flex items-center gap-1">
                <Thermometer className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
              </span>
            </Field>
          )}
          {(fp?.bed_temp_min || fp?.bed_temp_max) && (
            <Field label="Bed Temp">
              <span className="flex items-center gap-1">
                <Thermometer className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <TempRange min={fp.bed_temp_min} max={fp.bed_temp_max} />
              </span>
            </Field>
          )}
          {hex && (
            <Field label="Color">
              <span className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 shrink-0" style={{ color: hex }} />
                <span className="font-mono text-xs">{hex}</span>
              </span>
            </Field>
          )}
          <Field label="Spool ID">
            <span className="font-mono text-xs">FH-{spool.id}</span>
          </Field>
          {spool.location && (
            <Field label="Location">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                {spool.location.name}
              </span>
            </Field>
          )}
          {fp?.density && (
            <Field label="Density">
              <span className="flex items-center gap-1">
                <Weight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                {fp.density} g/cm³
              </span>
            </Field>
          )}
        </div>

        {spool.notes && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{spool.notes}</p>
          </div>
        )}

        {/* Edit button */}
        <button
          onClick={handleEdit}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-600/10 px-4 py-3 text-sm font-medium text-indigo-300 hover:bg-indigo-600/20 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Edit this spool (login required)
        </button>

        <p className="text-center text-xs text-gray-600 pb-4">
          Powered by <span className="text-gray-500">FilamentHub</span>
        </p>
      </div>
    </div>
  )
}
