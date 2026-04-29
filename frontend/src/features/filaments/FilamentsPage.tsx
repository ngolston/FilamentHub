import { useState } from 'react'
import { getStoredGeneralPrefs } from '@/hooks/useGeneralPrefs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Database, CheckCircle, Globe,
  Pencil, Trash2, ExternalLink, Thermometer, Wind,
  Package, PackageX,
} from 'lucide-react'
import { filamentsApi } from '@/api/filaments'
import { brandsApi } from '@/api/brands'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/utils/cn'
import { useAuth } from '@/hooks/useAuth'
import { FilamentFormModal } from './FilamentFormModal'
import { BrandFormModal } from './BrandFormModal'
import { SpoolFormModal } from '@/features/spools/SpoolFormModal'
import type { FilamentProfileResponse, BrandResponse } from '@/types/api'

type Tab = 'profiles' | 'brands'

const MATERIALS = ['All', 'PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'HIPS', 'PLA-CF', 'PETG-CF', 'Other']

export default function FilamentsPage() {
  const [tab, setTab] = useState<Tab>('profiles')

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Filament Profiles</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Reusable specs library — link profiles to spools so settings travel with the filament
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-surface-border bg-surface-1 p-1 w-fit">
        {([['profiles', 'Profiles'], ['brands', 'Brands']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'profiles' ? <ProfilesTab /> : <BrandsTab />}
    </div>
  )
}

// ─── Profiles tab ─────────────────────────────────────────────────────────────

function ProfilesTab() {
  const { isEditor } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [material, setMaterial] = useState('All')
  const [brandId, setBrandId] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FilamentProfileResponse | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FilamentProfileResponse | null>(null)
  const [addSpoolFor, setAddSpoolFor] = useState<FilamentProfileResponse | null>(null)

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsApi.list(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['filaments', { search, material, brandId, page }],
    queryFn: () => filamentsApi.list({
      search: search || undefined,
      material: material === 'All' ? undefined : material,
      brand_id: brandId,
      page,
      page_size: 24,
    }),
    placeholderData: (prev) => prev,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => filamentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filaments'] })
      setConfirmDelete(null)
    },
  })

  const filaments = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search profiles…"
            className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>

        <select
          value={brandId ?? ''}
          onChange={(e) => { setBrandId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}
          className="rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
        >
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <div className="flex gap-1.5 flex-wrap">
          {MATERIALS.map((m) => (
            <button
              key={m}
              onClick={() => { setMaterial(m); setPage(1) }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                material === m
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-white',
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {isEditor && (
          <Button size="sm" className="ml-auto shrink-0 gap-1.5" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add profile
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500">{total} profile{total !== 1 ? 's' : ''}</p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : filaments.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Database className="h-12 w-12 text-gray-600" />
          <div>
            <p className="text-sm font-medium text-gray-300">No filament profiles yet</p>
            <p className="mt-1 text-xs text-gray-500 max-w-xs">
              Profiles store print settings — temps, speeds, material — for a specific filament.
              Link them to spools so every spool automatically inherits the right settings.
            </p>
          </div>
          {isEditor && (
            <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create first profile
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filaments.map((f) => (
              <FilamentCard
                key={f.id}
                filament={f}
                canEdit={isEditor}
                onEdit={() => setEditing(f)}
                onDelete={() => {
                  if (getStoredGeneralPrefs().delete_confirm) setConfirmDelete(f)
                  else deleteMutation.mutate(f.id)
                }}
                onAddSpool={() => setAddSpoolFor(f)}
              />
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-gray-400">Page {page} of {pages}</span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {(showForm || editing) && (
        <FilamentFormModal
          filament={editing ?? undefined}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {addSpoolFor && (
        <SpoolFormModal
          prefillFilamentId={addSpoolFor.id}
          onClose={() => {
            setAddSpoolFor(null)
            queryClient.invalidateQueries({ queryKey: ['filaments'] })
          }}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          name={`${confirmDelete.brand?.name ? confirmDelete.brand.name + ' ' : ''}${confirmDelete.name}`}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  )
}

function FilamentCard({
  filament, canEdit, onEdit, onDelete, onAddSpool,
}: {
  filament: FilamentProfileResponse
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onAddSpool: () => void
}) {
  const hasPrintTemp = filament.print_temp_min || filament.print_temp_max
  const hasDryTemp = filament.drying_temp
  const hasSpools = filament.spool_count > 0

  return (
    <Card className="flex flex-col gap-0 hover:border-primary-700/50 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="h-10 w-10 shrink-0 rounded-xl border border-black/20"
            style={{ backgroundColor: filament.color_hex ?? '#374151' }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white leading-tight">{filament.name}</p>
            <p className="truncate text-xs text-gray-500">
              {filament.brand?.name ?? 'No brand'} · {filament.material}
            </p>
            {filament.color_name && (
              <p className="truncate text-xs text-gray-600">{filament.color_name}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button onClick={onEdit} className="rounded-md p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="rounded-md p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Stock status + spool count */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {hasSpools ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-700/40 px-2 py-0.5 text-xs font-medium text-emerald-400">
              <Package className="h-3 w-3" />
              {filament.spool_count} spool{filament.spool_count !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-500">
              {filament.remaining_weight_g >= 1000
                ? `${(filament.remaining_weight_g / 1000).toFixed(2)} kg`
                : `${Math.round(filament.remaining_weight_g)} g`} left
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 border border-surface-border px-2 py-0.5 text-xs font-medium text-gray-500">
            <PackageX className="h-3 w-3" />
            Not in stock
          </span>
        )}

        {filament.diameter && (
          <Badge variant="default">{filament.diameter}mm</Badge>
        )}
        {filament.is_verified && (
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" /> Verified
          </Badge>
        )}
        {filament.is_community && (
          <Badge variant="accent" className="gap-1">
            <Globe className="h-3 w-3" /> Community
          </Badge>
        )}
      </div>

      {/* Temp info */}
      {(hasPrintTemp || hasDryTemp) && (
        <div className="mt-3 flex flex-col gap-1 text-xs text-gray-400">
          {hasPrintTemp && (
            <span className="flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5 text-orange-400" />
              Print: {filament.print_temp_min ?? '?'}–{filament.print_temp_max ?? '?'}°C
              {filament.bed_temp_min && ` / Bed: ${filament.bed_temp_min}–${filament.bed_temp_max ?? '?'}°C`}
            </span>
          )}
          {hasDryTemp && (
            <span className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-sky-400" />
              Dry: {filament.drying_temp}°C
              {filament.drying_duration && ` for ${filament.drying_duration}h`}
            </span>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-3 pt-3 border-t border-surface-border flex items-center justify-between gap-2">
        {filament.product_url ? (
          <a
            href={filament.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Product page
          </a>
        ) : (
          <span />
        )}

        {canEdit && (
          <button
            onClick={onAddSpool}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-surface-2 hover:text-white transition-colors border border-surface-border"
          >
            <Plus className="h-3.5 w-3.5" />
            Add spool
          </button>
        )}
      </div>
    </Card>
  )
}

// ─── Brands tab ───────────────────────────────────────────────────────────────

function BrandsTab() {
  const { isEditor } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BrandResponse | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<BrandResponse | null>(null)

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['brands', search],
    queryFn: () => brandsApi.list(search || undefined),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => brandsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      setConfirmDelete(null)
    },
  })

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brands…"
            className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
        {isEditor && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add brand
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : brands.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Database className="h-12 w-12 text-gray-600" />
          <p className="text-sm text-gray-400">No brands found.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {brands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              canEdit={isEditor}
              onEdit={() => setEditing(brand)}
              onDelete={() => {
                if (getStoredGeneralPrefs().delete_confirm) setConfirmDelete(brand)
                else deleteMutation.mutate(brand.id)
              }}
            />
          ))}
        </div>
      )}

      {(showForm || editing) && (
        <BrandFormModal
          brand={editing ?? undefined}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          name={confirmDelete.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  )
}

function BrandCard({
  brand, canEdit, onEdit, onDelete,
}: {
  brand: BrandResponse
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="flex flex-col gap-2 hover:border-primary-700/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-white">{brand.name}</p>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button onClick={onEdit} className="rounded-md p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="rounded-md p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {brand.country_of_origin && (
        <p className="text-xs text-gray-500">{brand.country_of_origin}</p>
      )}

      {brand.notes && (
        <p className="text-xs text-gray-400 line-clamp-2">{brand.notes}</p>
      )}

      {brand.website && (
        <a
          href={brand.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> Website
        </a>
      )}
    </Card>
  )
}

// ─── Shared delete confirm ────────────────────────────────────────────────────

function DeleteConfirm({
  name, isPending, onConfirm, onCancel,
}: {
  name: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">Delete?</h3>
        <p className="mt-2 text-sm text-gray-400">
          <span className="font-medium text-white">{name}</span> will be permanently removed.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" size="sm" loading={isPending} onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  )
}
