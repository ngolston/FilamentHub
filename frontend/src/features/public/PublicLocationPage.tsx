import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Package, Thermometer, ExternalLink } from 'lucide-react'
import { publicApi } from '@/api/public'
import type { SpoolResponse } from '@/types/api'

function SpoolCard({ spool }: { spool: SpoolResponse }) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const name  = spool.name ?? fp?.name ?? 'Unnamed'
  const brand = fp?.brand?.name ?? spool.brand?.name ?? null
  const mat   = fp?.material ?? null

  return (
    <Link
      to={`/s/${spool.id}`}
      className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden hover:border-gray-600 transition-colors"
    >
      {/* Color stripe */}
      <div className="h-1.5 w-full" style={{ backgroundColor: hex ?? '#4b5563' }} />

      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          {hex && (
            <div
              className="h-8 w-8 rounded-lg border border-white/10 shrink-0 mt-0.5"
              style={{ backgroundColor: hex }}
            />
          )}
          <div className="min-w-0 flex-1">
            {brand && <p className="text-[10px] text-gray-500 uppercase tracking-wide truncate">{brand}</p>}
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            {mat && <p className="text-xs text-gray-400 truncate">{mat}{fp?.diameter ? ` · ${fp.diameter}mm` : ''}</p>}
          </div>
        </div>

        {/* Fill bar */}
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, spool.fill_percentage)}%`,
                backgroundColor: hex ?? '#6366f1',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 tabular-nums">
            <span>{spool.remaining_weight.toFixed(0)}g left</span>
            <span>{spool.fill_percentage.toFixed(0)}%</span>
          </div>
        </div>

        {(fp?.print_temp_min || fp?.print_temp_max) && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Thermometer className="h-3 w-3 text-orange-400 shrink-0" />
            {fp.print_temp_min && fp.print_temp_max
              ? `${fp.print_temp_min}–${fp.print_temp_max}°C`
              : fp.print_temp_min ? `${fp.print_temp_min}°C` : `${fp.print_temp_max}°C`}
          </p>
        )}
      </div>
    </Link>
  )
}

export default function PublicLocationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const locationId = Number(id)

  const { data: location, isLoading, isError } = useQuery({
    queryKey: ['public', 'location', locationId],
    queryFn: () => publicApi.getLocation(locationId),
    enabled: !isNaN(locationId),
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-indigo-400" />
      </div>
    )
  }

  if (isError || !location) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 gap-4">
        <MapPin className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Location not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="w-full py-6 px-4 flex flex-col items-center gap-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-indigo-400" />
          {location.is_dry_box && (
            <span className="rounded-full bg-blue-900/40 border border-blue-700/30 px-2 py-0.5 text-[10px] text-blue-300 uppercase tracking-wide">
              Dry Box
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-white text-center">{location.name}</h1>
        {location.description && (
          <p className="text-sm text-gray-400 text-center max-w-sm">{location.description}</p>
        )}
        <p className="text-xs text-gray-500">
          {location.spools.length} spool{location.spools.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Spool grid */}
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-6">
        {location.spools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
            <Package className="h-10 w-10" />
            <p className="text-sm">No spools in this location</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {location.spools.map((spool) => (
              <SpoolCard key={spool.id} spool={spool} />
            ))}
          </div>
        )}

        {/* Edit button */}
        <button
          onClick={() => navigate(`/login?redirect=${encodeURIComponent('/locations')}`)}
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-600/10 px-4 py-3 text-sm font-medium text-indigo-300 hover:bg-indigo-600/20 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Manage in FilamentHub (login required)
        </button>

        <p className="text-center text-xs text-gray-600 mt-4 pb-4">
          Powered by <span className="text-gray-500">FilamentHub</span>
        </p>
      </div>
    </div>
  )
}
