import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ExternalLink, Thermometer, Weight, MapPin, Palette,
  Package, Tag, Scale, Hash, DollarSign, Calendar,
  Gauge, Link2, Wind,
} from 'lucide-react'
import { publicApi } from '@/api/public'
import { useAuthStore } from '@/stores/auth'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/60">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
        {icon && <span className="text-gray-600">{icon}</span>}
        {label}
      </span>
      <span className="text-sm text-gray-100">{children}</span>
    </div>
  )
}

function Dash() {
  return <span className="text-gray-600 italic">—</span>
}

function TempRange({ min, max }: { min: number | null | undefined; max: number | null | undefined }) {
  if (!min && !max) return <Dash />
  return <>{min && max ? `${min}–${max}°C` : min ? `${min}°C` : `${max}°C`}</>
}

export default function PublicSpoolPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
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

  const extraColors = [
    spool.extra_color_hex_2,
    spool.extra_color_hex_3,
    spool.extra_color_hex_4,
  ].filter((c): c is string => Boolean(c))

  const statusLabel: Record<string, string> = {
    active: 'Active', storage: 'In Storage', archived: 'Archived',
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div
        className="w-full py-6 px-4 flex flex-col items-center gap-3"
        style={{ backgroundColor: hex ? `${hex}22` : '#1f2937' }}
      >
        {hex && (
          <div className="flex items-center gap-2">
            <div
              className="h-12 w-12 rounded-full border-4 border-white/20 shadow-lg"
              style={{ backgroundColor: hex }}
            />
            {extraColors.map((c, i) => (
              <div
                key={i}
                className="h-8 w-8 rounded-full border-2 border-white/20 shadow"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
        <div className="text-center">
          {brand && <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{brand}</p>}
          <h1 className="text-xl font-bold text-white">{name}</h1>
          {mat && (
            <p className="text-sm text-gray-400 mt-0.5">
              {mat}{fp?.diameter ? ` · ${fp.diameter}mm` : ''}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
            <span className="rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400 font-mono">
              FH-{spool.id}
            </span>
            <span className="rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300">
              {statusLabel[spool.status] ?? spool.status}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-md w-full mx-auto px-4 py-6 space-y-4">

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
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, spool.fill_percentage)}%`, backgroundColor: hex ?? '#6366f1' }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 tabular-nums">
            <span>Used: {spool.used_weight.toFixed(0)}g</span>
            <span>{spool.fill_percentage.toFixed(0)}% full</span>
          </div>
          {spool.spool_weight != null && spool.spool_weight > 0 && (
            <p className="text-xs text-gray-600">Empty spool: {spool.spool_weight.toFixed(0)}g</p>
          )}
        </div>

        {/* Filament info */}
        <Section title="Filament Info">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Brand" icon={<Tag className="h-3 w-3" />}>
              {brand ?? <Dash />}
            </Field>
            {fp?.name && (
              <Field label="Profile" icon={<Tag className="h-3 w-3" />}>
                {fp.name}
              </Field>
            )}
            <Field label="Material" icon={<Tag className="h-3 w-3" />}>
              {mat ?? <Dash />}
            </Field>
            <Field label="Diameter" icon={<Scale className="h-3 w-3" />}>
              {fp?.diameter ? `${fp.diameter} mm` : <Dash />}
            </Field>
            {(hex || extraColors.length > 0) && (
              <Field label="Color" icon={<Palette className="h-3 w-3" />}>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {hex && (
                    <>
                      <span className="h-4 w-4 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: hex }} />
                      <span className="font-mono text-xs">{fp?.color_name ?? hex}</span>
                    </>
                  )}
                  {extraColors.map((c, i) => (
                    <span key={i} className="h-4 w-4 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: c }} title={c} />
                  ))}
                </span>
              </Field>
            )}
            {fp?.density && (
              <Field label="Density" icon={<Weight className="h-3 w-3" />}>
                {fp.density} g/cm³
              </Field>
            )}
          </div>
        </Section>

        {/* Print settings */}
        {fp && (fp.print_temp_min || fp.print_temp_max || fp.bed_temp_min || fp.bed_temp_max || fp.max_print_speed || fp.drying_temp) && (
          <Section title="Print Settings">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {(fp.print_temp_min || fp.print_temp_max) && (
                <Field label="Nozzle Temp" icon={<Thermometer className="h-3 w-3" />}>
                  <TempRange min={fp.print_temp_min} max={fp.print_temp_max} />
                </Field>
              )}
              {(fp.bed_temp_min || fp.bed_temp_max) && (
                <Field label="Bed Temp" icon={<Thermometer className="h-3 w-3" />}>
                  <TempRange min={fp.bed_temp_min} max={fp.bed_temp_max} />
                </Field>
              )}
              {fp.max_print_speed && (
                <Field label="Max Speed" icon={<Gauge className="h-3 w-3" />}>
                  {fp.max_print_speed} mm/s
                </Field>
              )}
              {fp.drying_temp && (
                <Field label="Drying" icon={<Wind className="h-3 w-3" />}>
                  {fp.drying_temp}°C{fp.drying_duration ? ` · ${fp.drying_duration}h` : ''}
                </Field>
              )}
            </div>
          </Section>
        )}

        {/* Stock */}
        <Section title="Weight &amp; Stock">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Initial" icon={<Package className="h-3 w-3" />}>{spool.initial_weight.toFixed(0)}g</Field>
            <Field label="Used"    icon={<Package className="h-3 w-3" />}>{spool.used_weight.toFixed(0)}g</Field>
            <Field label="Remaining" icon={<Package className="h-3 w-3" />}>{spool.remaining_weight.toFixed(0)}g</Field>
            {spool.lot_nr && (
              <Field label="Lot Number" icon={<Hash className="h-3 w-3" />}>{spool.lot_nr}</Field>
            )}
          </div>
        </Section>

        {/* Storage */}
        <Section title="Storage">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Location" icon={<MapPin className="h-3 w-3" />}>
              {spool.location ? (
                <span className="flex items-center gap-1.5">
                  {spool.location.name}
                  {spool.location.is_dry_box && (
                    <span className="rounded-full bg-blue-900/40 border border-blue-700/30 px-1.5 py-0.5 text-[9px] text-blue-300">dry box</span>
                  )}
                </span>
              ) : <Dash />}
            </Field>
            {spool.first_used && (
              <Field label="First Used" icon={<Calendar className="h-3 w-3" />}>
                {new Date(spool.first_used).toLocaleDateString()}
              </Field>
            )}
          </div>
        </Section>

        {/* Purchase */}
        {(spool.supplier || spool.purchase_date || spool.purchase_price || spool.product_url) && (
          <Section title="Purchase &amp; Supplier">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-3">
              {spool.supplier && (
                <Field label="Supplier" icon={<Tag className="h-3 w-3" />}>{spool.supplier}</Field>
              )}
              {spool.purchase_date && (
                <Field label="Purchase Date" icon={<Calendar className="h-3 w-3" />}>
                  {new Date(spool.purchase_date).toLocaleDateString()}
                </Field>
              )}
              {spool.purchase_price != null && (
                <Field label="Price" icon={<DollarSign className="h-3 w-3" />}>
                  ${spool.purchase_price.toFixed(2)}
                </Field>
              )}
            </div>
            {spool.product_url && (
              <a
                href={spool.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 hover:border-gray-500 transition-colors"
              >
                <Link2 className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                <span className="text-sm text-indigo-400 truncate">{spool.product_url}</span>
              </a>
            )}
          </Section>
        )}

        {/* Notes */}
        {spool.notes && (
          <Section title="Notes">
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{spool.notes}</p>
          </Section>
        )}

        {/* Edit button */}
        <button
          onClick={() => {
            const target = `/spools/${spool.id}/edit`
            navigate(user ? target : `/login?redirect=${encodeURIComponent(target)}`)
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-600/10 px-4 py-3 text-sm font-medium text-indigo-300 hover:bg-indigo-600/20 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          {user ? 'Edit this spool' : 'Edit this spool (login required)'}
        </button>

        <p className="text-center text-xs text-gray-600 pb-4">
          Powered by <span className="text-gray-500">FilamentHub</span>
        </p>
      </div>
    </div>
  )
}
