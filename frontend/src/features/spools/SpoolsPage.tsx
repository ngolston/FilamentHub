import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Package, LayoutGrid, List, X,
  CheckSquare, Trash2, AlertTriangle,
  Printer, MapPin, Scale, Tag, Calendar, DollarSign,
  Thermometer, Droplets, Gauge, Hash, Link2, Pencil,
  Bookmark, BookmarkCheck, Columns3,
  Archive, PackageOpen,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { spoolsApi } from '@/api/spools'
import { printJobsApi } from '@/api/print-jobs'
import { printersApi } from '@/api/printers'
import { locationsApi } from '@/api/locations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { formatWeight, formatCurrency, formatDate, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { hexToColorName, hexToBasicColor, BASIC_COLORS, BASIC_COLOR_META } from '@/utils/colors'
import { SpoolTable } from './SpoolTable'
import { SpoolGrid } from './SpoolGrid'
import { useSpoolViews, loadColumns, saveColumns, DEFAULT_COLUMNS } from './useSpoolViews'
import type { SpoolResponse, SpoolStatus } from '@/types/api'
import type { SortKey, ColumnDef } from './SpoolTable'
import { Badge } from '@/components/ui/Badge'
import { getStoredGeneralPrefs } from '@/hooks/useGeneralPrefs'
import type { GeneralPrefs } from '@/hooks/useGeneralPrefs'

// ── Toast ─────────────────────────────────────────────────────────────────────
interface Toast { id: string; msg: string; type?: 'success' | 'error' }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  function toast(msg: string, type: Toast['type'] = 'success') {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }
  return { toasts, toast }
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg animate-fade-in',
            t.type === 'error'
              ? 'bg-red-900 border border-red-700 text-red-200'
              : 'bg-surface-2 border border-surface-border text-white',
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Pagination helper ─────────────────────────────────────────────────────────
function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const left  = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  const pages: (number | '…')[] = [1]
  if (left > 2)           pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1)  pages.push('…')
  pages.push(total)
  return pages
}

// ── Generic modal shell ───────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={cn(
        'relative w-full rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto',
        wide ? 'max-w-2xl' : 'max-w-sm',
      )}>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const STATUS_BADGE_COLORS: Record<SpoolStatus, string> = {
  active:   'bg-emerald-900/40 text-emerald-400 border-emerald-700/40',
  storage:  'bg-cyan-900/40 text-cyan-400 border-cyan-700/40',
  archived: 'bg-gray-800 text-gray-400 border-gray-700/40',
}

// ── Spool detail modal ────────────────────────────────────────────────────────

/** A labelled field row used inside view sections */
function ViewField({ label, value, icon, children }: {
  label: string; value?: string | null; icon?: React.ReactNode; children?: React.ReactNode
}) {
  const content = children ?? (value ? <span className="text-sm text-white">{value}</span> : <span className="text-sm text-gray-600 italic">—</span>)
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-gray-500 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        {content}
      </div>
    </div>
  )
}

/** Section header for the view modal */
function ViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{title}</h3>
      <div className="rounded-xl bg-surface-2 border border-surface-border p-4 space-y-3">
        {children}
      </div>
    </div>
  )
}

function SpoolDetailModal({ spool, onClose, onEdit }: {
  spool: SpoolResponse; onClose: () => void; onEdit: () => void
}) {
  const fp        = spool.filament
  const name      = spool.name ?? fp?.name ?? `Spool #${spool.id}`
  const hex       = fp?.color_hex ?? '#6366f1'
  const pct       = spool.fill_percentage
  const fillColor = pct > 30 ? '#06b6d4' : pct > 10 ? '#f59e0b' : '#ef4444'
  const r         = 36
  const circ      = 2 * Math.PI * r

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-surface-border bg-surface-1 shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Photo header */}
        {spool.photo_url && (
          <div className="relative h-48 w-full overflow-hidden rounded-t-2xl">
            <img src={spool.photo_url} alt={name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-1/90" />
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Header row */}
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-xl border border-white/10" style={{ backgroundColor: hex }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-white truncate">{name}</h2>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium capitalize', STATUS_BADGE_COLORS[spool.status])}>
                  {spool.status}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {spool.brand?.name && <span className="text-xs text-gray-500">{spool.brand.name}</span>}
                {fp?.color_name && <span className="text-xs text-gray-500">· {fp.color_name}</span>}
                {spool.name && fp?.name && spool.name !== fp.name && (
                  <span className="text-xs text-gray-600">({fp.name})</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Fill ring summary */}
          <div className="flex items-center gap-5 rounded-xl bg-surface-2 border border-surface-border p-4">
            <svg width="80" height="80" viewBox="0 0 88 88" className="shrink-0">
              <circle cx="44" cy="44" r={r} fill="none" stroke="#232840" strokeWidth="8" />
              {pct > 0 && (
                <circle cx="44" cy="44" r={r} fill="none" stroke={fillColor} strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * circ} ${circ}`}
                  transform="rotate(-90 44 44)"
                />
              )}
              <text x="44" y="40" textAnchor="middle" fill="white" fontSize="16" fontWeight="700" fontFamily="Poppins, sans-serif">{pct.toFixed(0)}%</text>
              <text x="44" y="54" textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="Poppins, sans-serif">remaining</text>
            </svg>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 flex-1">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Remaining</p>
                <p className="text-sm font-medium text-white">{formatWeight(spool.remaining_weight)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Initial</p>
                <p className="text-sm text-white">{formatWeight(spool.initial_weight)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Used</p>
                <p className="text-sm text-white">{formatWeight(spool.used_weight)}</p>
              </div>
              {spool.spool_weight != null && spool.spool_weight > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Empty spool weight</p>
                  <p className="text-sm text-white">{formatWeight(spool.spool_weight)}</p>
                </div>
              )}
              {spool.last_used && (
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Last used</p>
                  <p className="text-xs text-gray-400">{formatRelative(spool.last_used)}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Filament Info ── */}
          <ViewSection title="Filament Info">
            <div className="grid grid-cols-2 gap-3">
              <ViewField label="Brand" value={spool.brand?.name ?? fp?.brand?.name ?? null} icon={<Tag className="h-3.5 w-3.5" />} />
              <ViewField label="Profile name" value={fp?.name ?? null} icon={<Tag className="h-3.5 w-3.5" />} />
              <ViewField label="Material" value={fp?.material ?? null} icon={<Tag className="h-3.5 w-3.5" />} />
              <ViewField label="Diameter" value={fp?.diameter ? `${fp.diameter} mm` : null} icon={<Scale className="h-3.5 w-3.5" />} />
              <ViewField label="Colors" icon={<Tag className="h-3.5 w-3.5" />}>
                {(() => {
                  const colors = [
                    fp?.color_hex,
                    spool.extra_color_hex_2,
                    spool.extra_color_hex_3,
                    spool.extra_color_hex_4,
                  ].filter((c): c is string => Boolean(c))
                  if (colors.length === 0) return <span className="text-sm text-gray-600 italic">—</span>
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      {colors.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded-full border border-white/10 shrink-0" style={{ backgroundColor: c }} />
                          {i === 0 && fp?.color_name && <span className="text-sm text-white">{fp.color_name}</span>}
                          {i === 0 && !fp?.color_name && <span className="text-sm text-white font-mono text-xs">{c}</span>}
                          {i > 0 && <span className="text-sm text-white font-mono text-xs">{c}</span>}
                        </div>
                      ))}
                      {colors.length > 1 && (
                        <div className="flex h-3 flex-1 min-w-[48px] rounded-full overflow-hidden border border-white/10">
                          {colors.map((c, i) => (
                            <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </ViewField>
              <ViewField label="Spool name / label" value={spool.name ?? null} icon={<Hash className="h-3.5 w-3.5" />} />
            </div>
          </ViewSection>

          {/* ── Weight & Stock ── */}
          <ViewSection title="Weight &amp; Stock">
            <div className="grid grid-cols-2 gap-3">
              <ViewField label="Initial weight" value={formatWeight(spool.initial_weight)} icon={<Package className="h-3.5 w-3.5" />} />
              <ViewField label="Used weight" value={formatWeight(spool.used_weight)} icon={<Package className="h-3.5 w-3.5" />} />
              <ViewField label="Remaining weight" value={formatWeight(spool.remaining_weight)} icon={<Package className="h-3.5 w-3.5" />} />
              <ViewField label="Empty spool weight" value={spool.spool_weight ? formatWeight(spool.spool_weight) : null} icon={<Scale className="h-3.5 w-3.5" />} />
              <ViewField label="Lot number" value={spool.lot_nr ?? null} icon={<Hash className="h-3.5 w-3.5" />} />
            </div>
          </ViewSection>

          {/* ── Print Settings ── */}
          {fp && (fp.print_temp_min || fp.bed_temp_min || fp.max_print_speed || fp.drying_temp) && (
            <ViewSection title="Print Settings">
              <div className="grid grid-cols-2 gap-3">
                {(fp.print_temp_min || fp.print_temp_max) && (
                  <ViewField
                    label="Print temperature"
                    value={fp.print_temp_min && fp.print_temp_max ? `${fp.print_temp_min}–${fp.print_temp_max}°C` : `${fp.print_temp_min ?? fp.print_temp_max}°C`}
                    icon={<Thermometer className="h-3.5 w-3.5" />}
                  />
                )}
                {(fp.bed_temp_min || fp.bed_temp_max) && (
                  <ViewField
                    label="Bed temperature"
                    value={fp.bed_temp_min && fp.bed_temp_max ? `${fp.bed_temp_min}–${fp.bed_temp_max}°C` : `${fp.bed_temp_min ?? fp.bed_temp_max}°C`}
                    icon={<Thermometer className="h-3.5 w-3.5" />}
                  />
                )}
                {fp.max_print_speed && (
                  <ViewField label="Max print speed" value={`${fp.max_print_speed} mm/s`} icon={<Gauge className="h-3.5 w-3.5" />} />
                )}
                {fp.drying_temp && (
                  <ViewField
                    label="Drying"
                    value={`${fp.drying_temp}°C${fp.drying_duration ? ` · ${fp.drying_duration}h` : ''}`}
                    icon={<Droplets className="h-3.5 w-3.5" />}
                  />
                )}
              </div>
            </ViewSection>
          )}

          {/* ── Storage ── */}
          <ViewSection title="Storage">
            <div className="grid grid-cols-2 gap-3">
              <ViewField label="Location" icon={<MapPin className="h-3.5 w-3.5" />}>
                {spool.location
                  ? <div className="flex items-center gap-1.5">
                      <span className="text-sm text-white">{spool.location.name}</span>
                      {spool.location.is_dry_box && (
                        <span className="rounded-full bg-cyan-900/40 border border-cyan-700/40 text-cyan-400 text-[10px] px-1.5 py-0.5">dry box</span>
                      )}
                    </div>
                  : <span className="text-sm text-gray-600 italic">—</span>
                }
              </ViewField>
              <ViewField label="First used" value={spool.first_used ? formatDate(spool.first_used) : null} icon={<Calendar className="h-3.5 w-3.5" />} />
            </div>
          </ViewSection>

          {/* ── Purchase & Supplier ── */}
          <ViewSection title="Purchase &amp; Supplier">
            <div className="grid grid-cols-2 gap-3">
              <ViewField label="Supplier" value={spool.supplier ?? null} icon={<Printer className="h-3.5 w-3.5" />} />
              <ViewField label="Purchase date" value={spool.purchase_date ? formatDate(spool.purchase_date) : null} icon={<Calendar className="h-3.5 w-3.5" />} />
              <ViewField label="Purchase price" value={spool.purchase_price ? formatCurrency(spool.purchase_price) : null} icon={<DollarSign className="h-3.5 w-3.5" />} />
            </div>
            {spool.product_url && (
              <div className="pt-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Product URL</p>
                <a href={spool.product_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 hover:border-primary-700/40 transition-colors group">
                  <Link2 className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                  <span className="text-sm text-primary-400 group-hover:text-primary-300 truncate">{spool.product_url}</span>
                </a>
              </div>
            )}
          </ViewSection>

          {/* ── Notes ── */}
          {spool.notes && (
            <ViewSection title="Notes">
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{spool.notes}</p>
            </ViewSection>
          )}

          {/* QR code */}
          <div className="flex items-center gap-4 rounded-xl border border-surface-border p-3">
            <div className="rounded-lg bg-white p-2 shrink-0">
              <QRCodeSVG value={`filamenthub://spool/${spool.id}`} size={64} bgColor="#ffffff" fgColor="#0f1117" level="M" />
            </div>
            <div>
              <p className="text-xs font-medium text-white">Spool #{spool.id}</p>
              <p className="text-xs text-gray-500 mt-0.5">Scan to look up this spool</p>
              {spool.registered && <p className="text-xs text-gray-600 mt-0.5">Added {formatRelative(spool.registered)}</p>}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit spool
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Confirm delete modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ count, name, loading, onClose, onConfirm }: {
  count: number; name?: string; loading: boolean; onClose: () => void; onConfirm: () => void
}) {
  return (
    <Modal title={count === 1 ? 'Delete spool?' : `Delete ${count} spools?`} onClose={onClose}>
      <p className="text-sm text-gray-400">
        {count === 1 && name
          ? <>This will permanently delete <span className="text-white font-medium">{name}</span>.</>
          : <>This will permanently delete <span className="text-white font-medium">{count} spools</span>.</>
        }
        {' '}This cannot be undone.
      </p>
      <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>
          Delete {count > 1 ? `${count} spools` : 'spool'}
        </Button>
      </div>
    </Modal>
  )
}

// ── Load-to-printer modal ─────────────────────────────────────────────────────
function LoadPrinterModal({ onClose, onConfirm }: {
  spool: SpoolResponse; onClose: () => void; onConfirm: (printerName: string | null) => void
}) {
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: printersApi.list })
  const [choice, setChoice] = useState<string | null>(null)

  return (
    <Modal title="Load to printer" onClose={onClose}>
      <div className="space-y-1">
        {[{ id: '__unload__', name: 'Unload / none' }, ...printers].map((p) => (
          <label key={p.id} className="flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2.5 hover:bg-surface-2">
            <input
              type="radio"
              name="printer"
              value={String(p.id)}
              checked={choice === String(p.id)}
              onChange={() => setChoice(String(p.id))}
              className="accent-primary-500"
            />
            <div>
              <p className="text-sm font-medium text-white">{p.name}</p>
              {'model' in p && p.model && <p className="text-xs text-gray-500">{p.model}</p>}
            </div>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!choice}
          onClick={() => {
            if (!choice) return
            const name = choice === '__unload__' ? null
              : printers.find((p) => String(p.id) === choice)?.name ?? null
            onConfirm(name)
          }}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  )
}

// ── Log-usage modal ───────────────────────────────────────────────────────────
function LogUsageModal({ spool, onClose, onConfirm, saving }: {
  spool: SpoolResponse; onClose: () => void
  onConfirm: (grams: number, note: string) => void; saving: boolean
}) {
  const [grams, setGrams] = useState('')
  const [note,  setNote]  = useState('')
  const used   = parseFloat(grams) || 0
  const newRem = Math.max(0, spool.remaining_weight - used)
  const newPct = spool.initial_weight > 0 ? (newRem / spool.initial_weight) * 100 : 0
  const severity = newPct > 30 ? 'text-green-400' : newPct > 10 ? 'text-yellow-400' : 'text-red-400'

  return (
    <Modal title="Log usage" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Current remaining</p>
          <p className="text-sm font-medium text-white">
            {formatWeight(spool.remaining_weight)} ({spool.fill_percentage.toFixed(0)}%)
          </p>
        </div>
        <Input
          label="Amount used (g)"
          type="number"
          min={0}
          max={spool.remaining_weight}
          step={1}
          placeholder="e.g. 45"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          autoFocus
        />
        {used > 0 && (
          <div className={cn('rounded-lg border px-3 py-2 text-sm',
            newPct > 30 ? 'border-green-700/40 bg-green-900/10' :
            newPct > 10 ? 'border-yellow-700/40 bg-yellow-900/10' :
                          'border-red-700/40 bg-red-900/10'
          )}>
            <p className="text-gray-400 text-xs mb-0.5">New remaining</p>
            <p className={`font-semibold ${severity}`}>{formatWeight(newRem)} — {newPct.toFixed(0)}%</p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-300">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Benchy print"
            className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!used || used <= 0} loading={saving} onClick={() => onConfirm(used, note)}>
          Log usage
        </Button>
      </div>
    </Modal>
  )
}

// ── Filter select ─────────────────────────────────────────────────────────────
function FilterSelect({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void
  label: string; options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
function toSortKey(s: GeneralPrefs['sort_order']): SortKey {
  if (s === 'fill_pct')  return 'fill_pct'
  if (s === 'material')  return 'material'
  if (s === 'brand')     return 'name'
  return 'last_used'
}

export default function SpoolsPage() {
  const { isEditor }       = useAuth()
  const navigate           = useNavigate()
  const queryClient        = useQueryClient()
  const { toasts, toast }  = useToast()

  const pageSize = getStoredGeneralPrefs().page_size

  // ── Views (saved configurations) ───────────────────────────────────────────
  const { allViews, activeView, activeId, activateView, saveView, deleteView } = useSpoolViews()
  const [saveViewOpen, setSaveViewOpen] = useState(false)
  const [saveViewName, setSaveViewName] = useState('')

  // ── Column visibility ───────────────────────────────────────────────────────
  const [visibleCols,  setVisibleCols]  = useState<string[]>(() => loadColumns())
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState('')
  const [material,      setMaterial]      = useState('')
  const [brandFilter,   setBrandFilter]   = useState('')
  const [statusFlt,     setStatusFlt]     = useState('')
  const [colorFlt,      setColorFlt]      = useState('')
  const [basicColorFlt, setBasicColorFlt] = useState('')
  const [locationFlt,   setLocationFlt]   = useState('')
  const [printerFlt,    setPrinterFlt]    = useState('')

  // ── View / sort ─────────────────────────────────────────────────────────────
  const [view,    setView]    = useState<'table' | 'grid'>(() => getStoredGeneralPrefs().view_mode)
  const [page,    setPage]    = useState(1)
  const [sortBy,  setSortBy]  = useState<SortKey>(() => toSortKey(getStoredGeneralPrefs().sort_order))
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [viewSpool,    setViewSpool]    = useState<SpoolResponse | null>(null)
  const [loadModal,    setLoadModal]    = useState<SpoolResponse | null>(null)
  const [logModal,     setLogModal]     = useState<SpoolResponse | null>(null)
  const [deleteModal,  setDeleteModal]  = useState<{ ids: number[]; name?: string } | null>(null)
  const [moveLocModal, setMoveLocModal] = useState(false)

  // ── Printer assignments (local state) ──────────────────────────────────────
  const [spoolPrinters, setSpoolPrinters] = useState<Record<number, string>>({})

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['spools', 'all'],
    queryFn: () => spoolsApi.list({ page_size: 200 }),
  })
  const allSpools = data?.items ?? []
  // Pre-fetch printers so LoadPrinterModal is instant
  useQuery({ queryKey: ['printers'], queryFn: printersApi.list })

  // ── Derived filter options ─────────────────────────────────────────────────
  const materials = useMemo(() =>
    [...new Set(allSpools.map((s) => s.filament?.material).filter((m): m is string => !!m))].sort()
  , [allSpools])

  const brands = useMemo(() => {
    const map = new Map<number, string>()
    allSpools.forEach((s) => {
      const b = s.brand ?? s.filament?.brand
      if (b) map.set(b.id, b.name)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [allSpools])

  const printerNames = useMemo(() => [...new Set(Object.values(spoolPrinters))].sort(), [spoolPrinters])

  // Helper: all hex values for a spool (1–4 colors)
  function spoolHexes(s: SpoolResponse): string[] {
    return [s.filament?.color_hex, s.extra_color_hex_2, s.extra_color_hex_3, s.extra_color_hex_4]
      .filter((c): c is string => Boolean(c))
  }

  // Derived color names from all hex values across all spools
  const colorNames = useMemo(() => {
    const names = new Set<string>()
    allSpools.forEach((s) => spoolHexes(s).forEach((hex) => names.add(hexToColorName(hex))))
    return [...names].sort()
  }, [allSpools])

  // Basic color categories present in inventory (from all 4 hex slots)
  const presentBasicColors = useMemo(() => {
    const cats = new Set<string>()
    allSpools.forEach((s) => spoolHexes(s).forEach((hex) => cats.add(hexToBasicColor(hex))))
    return BASIC_COLORS.filter((c) => cats.has(c))
  }, [allSpools])

  const locations = useMemo(() => {
    const map = new Map<number, string>()
    allSpools.forEach((s) => { if (s.location) map.set(s.location.id, s.location.name) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [allSpools])

  // ── Stats (full inventory, unfiltered) ────────────────────────────────────
  const stats = useMemo(() => {
    const total    = allSpools.length
    const ok       = allSpools.filter((s) => s.fill_percentage > 30).length
    const low      = allSpools.filter((s) => s.fill_percentage <= 30 && s.fill_percentage > 10).length
    const critical = allSpools.filter((s) => s.fill_percentage <= 10).length
    const remainKg = allSpools.reduce((sum, s) => sum + s.remaining_weight, 0) / 1000
    return { total, ok, low, critical, remainKg }
  }, [allSpools])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const hasFilters = !!(search || material || brandFilter || statusFlt || printerFlt || colorFlt || basicColorFlt || locationFlt)

  const filtered = useMemo(() => {
    let r = allSpools
    if (search) {
      const q = search.toLowerCase()
      r = r.filter((s) =>
        (s.name ?? s.filament?.name ?? '').toLowerCase().includes(q) ||
        (s.brand?.name ?? s.filament?.brand?.name ?? '').toLowerCase().includes(q) ||
        (s.filament?.color_name ?? '').toLowerCase().includes(q) ||
        (s.filament?.material ?? '').toLowerCase().includes(q) ||
        spoolHexes(s).some((h) => hexToColorName(h).toLowerCase().includes(q)) ||
        String(s.id).includes(q)
      )
    }
    if (statusFlt)      r = r.filter((s) => s.status === statusFlt)
    if (material)       r = r.filter((s) => s.filament?.material === material)
    if (brandFilter)    r = r.filter((s) => {
      const b = s.brand ?? s.filament?.brand
      return b && String(b.id) === brandFilter
    })
    if (printerFlt)     r = r.filter((s) => spoolPrinters[s.id] === printerFlt)
    if (colorFlt)       r = r.filter((s) => spoolHexes(s).some((h) => hexToColorName(h) === colorFlt))
    if (basicColorFlt)  r = r.filter((s) => spoolHexes(s).some((h) => hexToBasicColor(h) === basicColorFlt))
    if (locationFlt)    r = r.filter((s) => s.location && String(s.location.id) === locationFlt)
    return r
  }, [allSpools, search, statusFlt, material, brandFilter, printerFlt, colorFlt, basicColorFlt, locationFlt, spoolPrinters])

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortBy) {
        case 'name':      av = a.name ?? a.filament?.name ?? ''; bv = b.name ?? b.filament?.name ?? ''; break
        case 'material':  av = a.filament?.material ?? ''; bv = b.filament?.material ?? ''; break
        case 'status':    av = a.status; bv = b.status; break
        case 'fill_pct':  av = a.fill_percentage; bv = b.fill_percentage; break
        case 'remaining': av = a.remaining_weight; bv = b.remaining_weight; break
        case 'last_used': av = a.last_used ?? ''; bv = b.last_used ?? ''; break
        default:          av = a.id; bv = b.id
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [filtered, sortBy, sortDir])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage  = Math.min(page, pageCount)
  const paged     = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => { setPage(1) }, [search, material, brandFilter, statusFlt, printerFlt, colorFlt, basicColorFlt, locationFlt])

  // ── Sort handler ───────────────────────────────────────────────────────────
  function handleSort(col: SortKey) {
    if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  // ── Selection helpers ──────────────────────────────────────────────────────
  function selectAll(checked: boolean) {
    setSelected(checked ? new Set(paged.map((s) => s.id)) : new Set())
  }
  function selectOne(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function clearSelection() { setSelected(new Set()) }

  // ── Location data (for move modal) ────────────────────────────────────────
  const { data: allLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await spoolsApi.delete(id)
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      setDeleteModal(null)
      setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n })
      toast(`${ids.length} spool${ids.length !== 1 ? 's' : ''} deleted`)
    },
    onError: () => toast('Delete failed', 'error'),
  })

  const bulkMutation = useMutation({
    mutationFn: spoolsApi.bulkAction,
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      const count = vars.ids.length
      const label = count === 1 ? '1 spool' : `${count} spools`
      if (vars.action === 'delete') {
        setDeleteModal(null)
        setSelected((s) => { const n = new Set(s); vars.ids.forEach((id) => n.delete(id)); return n })
        toast(`${label} deleted`)
      } else if (vars.action === 'move_location') {
        setMoveLocModal(false)
        toast(`${label} moved`)
      } else {
        const statusLabel = vars.action === 'archive' ? 'archived'
          : vars.action === 'activate' ? 'set to active'
          : 'set to storage'
        toast(`${label} ${statusLabel}`)
      }
    },
    onError: () => toast('Action failed', 'error'),
  })

  const logMutation = useMutation({
    mutationFn: async ({ spool, grams, note }: { spool: SpoolResponse; grams: number; note: string }) => {
      // Create a print job — the backend handles deducting from used_weight
      await printJobsApi.create({
        spool_id: spool.id,
        filament_used_g: grams,
        notes: note || undefined,
        finished_at: new Date().toISOString(),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      setLogModal(null)
      toast('Usage logged')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (spool: SpoolResponse) =>
      spoolsApi.create({
        filament_id:    spool.filament?.id,
        brand_id:       spool.brand?.id,
        initial_weight: spool.initial_weight,
        spool_weight:   spool.spool_weight,
        used_weight:    0,
        status:         'active',
        lot_nr:         spool.lot_nr ?? undefined,
        notes:          spool.notes  ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spools'] })
      toast('Spool duplicated')
    },
  })

  function handleLoadPrinter(printerName: string | null) {
    if (!loadModal) return
    if (printerName) {
      setSpoolPrinters((p) => ({ ...p, [loadModal.id]: printerName }))
      toast(`Loaded to ${printerName}`)
    } else {
      setSpoolPrinters((p) => { const n = { ...p }; delete n[loadModal.id]; return n })
      toast('Spool unloaded')
    }
    setLoadModal(null)
  }

  // ── Column definitions ─────────────────────────────────────────────────────
  const STATUS_BADGE_COL: Record<SpoolStatus, 'success' | 'warning' | 'accent' | 'default'> = {
    active: 'success', storage: 'accent', archived: 'default',
  }
  function fillSev(pct: number) { return pct > 30 ? 'bg-accent-500' : pct > 10 ? 'bg-yellow-400' : 'bg-red-500' }

  const columnDefs = useMemo((): ColumnDef[] => [
    {
      key: 'id', label: 'ID', thClassName: 'w-14',
      render: (s) => <span className="text-xs text-gray-500 tabular-nums">#{s.id}</span>,
    },
    {
      key: 'color', label: 'Color', thClassName: 'w-14',
      render: (s) => {
        const colors = [s.filament?.color_hex, s.extra_color_hex_2, s.extra_color_hex_3, s.extra_color_hex_4]
          .filter((c): c is string => Boolean(c))
        return (
          <div className="flex items-center">
            {colors.length > 0
              ? colors.map((c, i) => (
                  <div key={i} className="h-5 w-5 rounded-full border-2 border-surface-1"
                    style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -6 }} title={hexToColorName(c)} />
                ))
              : <div className="h-5 w-5 rounded-full border border-white/10 bg-surface-3" />
            }
          </div>
        )
      },
    },
    {
      key: 'name', label: 'Name', sortKey: 'name', thClassName: 'min-w-[160px]',
      render: (s) => {
        const name = s.name ?? s.filament?.name ?? `Spool #${s.id}`
        const brand = s.brand?.name ?? s.filament?.brand?.name ?? ''
        return (
          <div>
            <p className="font-medium text-white truncate max-w-[200px]">{name}</p>
            {brand && <p className="text-xs text-gray-500 truncate max-w-[200px]">{brand}</p>}
          </div>
        )
      },
    },
    {
      key: 'material', label: 'Material', sortKey: 'material', thClassName: 'w-28',
      render: (s) => <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-gray-300">{s.filament?.material ?? '—'}</span>,
    },
    {
      key: 'color_name', label: 'Color Name', thClassName: 'w-32',
      render: (s) => {
        const hex = s.filament?.color_hex
        return <span className="text-sm text-gray-300">{hex ? hexToColorName(hex) : '—'}</span>
      },
    },
    {
      key: 'basic_color', label: 'Color Family', thClassName: 'w-32',
      render: (s) => {
        const hex = s.filament?.color_hex
        if (!hex) return <span className="text-gray-500">—</span>
        const basic = hexToBasicColor(hex)
        const { label, dot } = BASIC_COLOR_META[basic]
        return (
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-white/10 shrink-0" style={{ backgroundColor: dot }} />
            <span className="text-sm text-gray-300 capitalize">{label}</span>
          </div>
        )
      },
    },
    {
      key: 'status', label: 'Status', sortKey: 'status', thClassName: 'w-28',
      render: (s) => <Badge variant={STATUS_BADGE_COL[s.status]}>{s.status}</Badge>,
    },
    {
      key: 'fill', label: 'Fill', sortKey: 'fill_pct', thClassName: 'w-40',
      render: (s) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div className={`h-full rounded-full ${fillSev(s.fill_percentage)}`} style={{ width: `${Math.min(s.fill_percentage, 100)}%` }} />
          </div>
          <span className={`text-xs tabular-nums w-8 text-right ${s.fill_percentage > 30 ? 'text-gray-300' : s.fill_percentage > 10 ? 'text-yellow-400' : 'text-red-400'}`}>
            {s.fill_percentage.toFixed(0)}%
          </span>
        </div>
      ),
    },
    {
      key: 'remaining', label: 'Remaining', sortKey: 'remaining', thClassName: 'w-28',
      render: (s) => <span className="text-gray-300 tabular-nums">{formatWeight(s.remaining_weight)}</span>,
    },
    {
      key: 'used', label: 'Used', thClassName: 'w-28',
      render: (s) => <span className="text-gray-400 tabular-nums">{formatWeight(s.used_weight)}</span>,
    },
    {
      key: 'initial', label: 'Initial', thClassName: 'w-28',
      render: (s) => <span className="text-gray-400 tabular-nums">{formatWeight(s.initial_weight)}</span>,
    },
    {
      key: 'location', label: 'Location', thClassName: 'w-32',
      render: (s) => <span className="text-xs text-gray-400">{s.location?.name ?? '—'}</span>,
    },
    {
      key: 'supplier', label: 'Supplier', thClassName: 'w-32',
      render: (s) => <span className="text-xs text-gray-400">{s.supplier ?? '—'}</span>,
    },
    {
      key: 'lot_nr', label: 'Lot #', thClassName: 'w-28',
      render: (s) => <span className="text-xs text-gray-400">{s.lot_nr ?? '—'}</span>,
    },
    {
      key: 'printer', label: 'Printer', thClassName: 'w-36',
      render: (s) => <span className="text-xs text-gray-400 truncate max-w-[140px] block">{spoolPrinters[s.id] ?? '—'}</span>,
    },
    {
      key: 'last_used', label: 'Last used', sortKey: 'last_used', thClassName: 'w-32',
      render: (s) => <span className="text-xs text-gray-500">{s.last_used ? formatRelative(s.last_used) : 'Never'}</span>,
    },
    {
      key: 'registered', label: 'Added', thClassName: 'w-32',
      render: (s) => <span className="text-xs text-gray-500">{formatRelative(s.registered)}</span>,
    },
  ], [spoolPrinters])

  const activeColumns = useMemo(
    () => columnDefs.filter((c) => visibleCols.includes(c.key)),
    [columnDefs, visibleCols],
  )

  // ── View helpers ───────────────────────────────────────────────────────────
  function applyView(v: typeof activeView) {
    setSearch(v.filters.search)
    setMaterial(v.filters.material)
    setBrandFilter(v.filters.brandFilter)
    setStatusFlt(v.filters.statusFlt)
    setColorFlt(v.filters.colorFlt)
    setBasicColorFlt(v.filters.basicColorFlt)
    setLocationFlt(v.filters.locationFlt)
    setPrinterFlt(v.filters.printerFlt)
    setSortBy(v.sortBy)
    setSortDir(v.sortDir)
    setView(v.viewMode)
    const cols = v.columns.length > 0 ? v.columns : DEFAULT_COLUMNS
    setVisibleCols(cols)
    saveColumns(cols)
  }

  function handleActivateView(id: string) {
    activateView(id)
    const v = allViews.find((x) => x.id === id)
    if (v) applyView(v)
  }

  function handleSaveView() {
    const id = saveViewName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    saveView({
      id,
      name: saveViewName.trim(),
      columns: visibleCols,
      filters: { search, material, brandFilter, statusFlt, colorFlt, basicColorFlt, locationFlt, printerFlt },
      sortBy, sortDir, viewMode: view,
    })
    activateView(id)
    setSaveViewOpen(false)
    setSaveViewName('')
    toast('View saved')
  }

  function clearAllFilters() {
    setSearch(''); setMaterial(''); setBrandFilter(''); setStatusFlt('')
    setColorFlt(''); setBasicColorFlt(''); setLocationFlt(''); setPrinterFlt('')
  }

  const rowProps = {
    spoolPrinters,
    isEditor,
    onView:        (s: SpoolResponse) => setViewSpool(s),
    onEdit:        (s: SpoolResponse) => navigate(`/spools/${s.id}/edit`),
    onDelete:      (s: SpoolResponse) => {
      if (getStoredGeneralPrefs().delete_confirm) {
        setDeleteModal({ ids: [s.id], name: s.name ?? s.filament?.name ?? `Spool #${s.id}` })
      } else {
        bulkMutation.mutate({ ids: [s.id], action: 'delete' })
      }
    },
    onLoadPrinter: (s: SpoolResponse) => setLoadModal(s),
    onLogUsage:    (s: SpoolResponse) => setLogModal(s),
    onPrintQR:     (s: SpoolResponse) => toast(`QR queued for ${s.name ?? s.filament?.name ?? `Spool #${s.id}`}`),
    onDuplicate:   (s: SpoolResponse) => duplicateMutation.mutate(s),
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { label: 'Total',     value: stats.total,                       color: 'text-white' },
          { label: 'OK',        value: stats.ok,                          color: 'text-emerald-400' },
          { label: 'Low',       value: stats.low,                         color: 'text-yellow-400' },
          { label: 'Critical',  value: stats.critical,                    color: 'text-red-400' },
          { label: 'Remaining', value: `${stats.remainKg.toFixed(2)} kg`, color: 'text-accent-400' },
        ] as const).map((s) => (
          <div key={s.label} className="rounded-xl border border-surface-border bg-surface-1 px-4 py-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Low stock banner ───────────────────────────────────────────────── */}
      {getStoredGeneralPrefs().low_stock_banner && (stats.low + stats.critical) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-700/50 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
          <span>
            <strong>{stats.low + stats.critical}</strong> spool{(stats.low + stats.critical) !== 1 ? 's' : ''} {(stats.low + stats.critical) !== 1 ? 'are' : 'is'} running low
            {stats.critical > 0 && <> — <strong>{stats.critical}</strong> critical</>}.
          </span>
        </div>
      )}

      {/* ── Views bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {allViews.map((v) => (
          <div key={v.id} className="relative group/chip">
            <button
              onClick={() => handleActivateView(v.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                activeId === v.id
                  ? 'border-primary-500 bg-primary-600/20 text-primary-300'
                  : 'border-surface-border text-gray-400 hover:border-primary-700/50 hover:text-gray-200',
              )}
            >
              {v.name}
            </button>
            {!v.builtIn && (
              <button
                onClick={() => deleteView(v.id)}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-surface-2 border border-surface-border text-gray-500 hover:text-red-400
                  hidden group-hover/chip:flex items-center justify-center transition-colors"
                title="Delete view"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}

        {/* Update active custom view */}
        {!activeView.builtIn && !saveViewOpen && (
          <button
            onClick={() => {
              saveView({
                ...activeView,
                columns: visibleCols,
                filters: { search, material, brandFilter, statusFlt, colorFlt, basicColorFlt, locationFlt, printerFlt },
                sortBy, sortDir, viewMode: view,
              })
              toast(`"${activeView.name}" updated`)
            }}
            className="flex items-center gap-1 rounded-full border border-surface-border px-3 py-1 text-xs text-gray-400 hover:border-primary-700/50 hover:text-gray-200 transition-colors"
          >
            <BookmarkCheck className="h-3 w-3" /> Update view
          </button>
        )}

        {/* Save as new view */}
        {saveViewOpen ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && saveViewName.trim()) handleSaveView(); if (e.key === 'Escape') setSaveViewOpen(false) }}
              placeholder="View name…"
              className="rounded-lg border border-primary-500 bg-surface-2 px-2.5 py-1 text-xs text-white placeholder:text-gray-500 focus:outline-none w-32"
            />
            <button
              onClick={() => { if (saveViewName.trim()) handleSaveView() }}
              disabled={!saveViewName.trim()}
              className="rounded-full border border-primary-500 bg-primary-600/20 px-2.5 py-1 text-xs text-primary-300 hover:bg-primary-600/40 disabled:opacity-40 transition-colors"
            >Save</button>
            <button onClick={() => setSaveViewOpen(false)} className="text-gray-500 hover:text-gray-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSaveViewOpen(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-surface-border px-3 py-1 text-xs text-gray-500 hover:border-primary-700/50 hover:text-gray-300 transition-colors"
          >
            <Bookmark className="h-3 w-3" /> Save as new
          </button>
        )}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, brand, color, ID…"
            className="w-full rounded-lg border border-surface-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>

        <FilterSelect value={statusFlt}   onChange={setStatusFlt}   label="Status"   options={(['active','storage','archived'] as SpoolStatus[]).map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} />
        <FilterSelect value={material}    onChange={setMaterial}    label="Material" options={materials.map((m) => ({ value: m, label: m }))} />
        <FilterSelect value={brandFilter} onChange={setBrandFilter} label="Brand"    options={brands.map(([id, name]) => ({ value: String(id), label: name }))} />
        {/* Basic color filter with color dot */}
        <select
          value={basicColorFlt}
          onChange={(e) => setBasicColorFlt(e.target.value)}
          className="rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
        >
          <option value="">Color family</option>
          {presentBasicColors.map((c) => (
            <option key={c} value={c}>{BASIC_COLOR_META[c].label}</option>
          ))}
        </select>
        <FilterSelect value={colorFlt}    onChange={setColorFlt}    label="Color name" options={colorNames.map((c) => ({ value: c, label: c }))} />
        <FilterSelect value={locationFlt} onChange={setLocationFlt} label="Location" options={locations.map(([id, name]) => ({ value: String(id), label: name }))} />
        <FilterSelect value={printerFlt}  onChange={setPrinterFlt}  label="Printer"  options={printerNames.map((n) => ({ value: n, label: n }))} />

        {hasFilters && (
          <button onClick={clearAllFilters} className="flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300">
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Column picker (table view only) */}
          {view === 'table' && (
            <div className="relative" ref={colPickerRef}>
              <button
                onClick={() => setColPickerOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                  colPickerOpen
                    ? 'border-primary-500 bg-primary-900/20 text-primary-300'
                    : 'border-surface-border bg-surface-2 text-gray-400 hover:text-gray-200',
                )}
                title="Customize columns"
              >
                <Columns3 className="h-4 w-4" />
                <span className="hidden sm:inline">Columns</span>
              </button>
              {colPickerOpen && (
                <div className="absolute right-0 top-full mt-2 z-40 w-52 rounded-xl border border-surface-border bg-surface-1 shadow-2xl p-3 space-y-0.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 pb-1.5">Visible columns</p>
                  {columnDefs.map((col) => {
                    const checked = visibleCols.includes(col.key)
                    return (
                      <label key={col.key} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...visibleCols, col.key]
                              : visibleCols.filter((k) => k !== col.key)
                            setVisibleCols(next)
                            saveColumns(next)
                          }}
                          className="accent-primary-500 rounded"
                        />
                        <span className="text-sm text-gray-300">{col.label}</span>
                      </label>
                    )
                  })}
                  <div className="pt-2 border-t border-surface-border flex justify-between">
                    <button
                      onClick={() => { setVisibleCols(DEFAULT_COLUMNS); saveColumns(DEFAULT_COLUMNS) }}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >Reset</button>
                    <button
                      onClick={() => { const all = columnDefs.map((c) => c.key); setVisibleCols(all); saveColumns(all) }}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >Show all</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex rounded-lg border border-surface-border bg-surface-2 p-0.5">
            <button
              onClick={() => setView('table')}
              className={cn('rounded p-1.5 transition-colors', view === 'table' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={cn('rounded p-1.5 transition-colors', view === 'grid' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          {isEditor && (
            <Button size="sm" onClick={() => navigate('/spools/new')}>
              <Plus className="h-4 w-4" /> Add spool
            </Button>
          )}
        </div>
      </div>

      {/* ── Bulk toolbar ───────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary-700/40 bg-primary-900/20 px-4 py-2.5 animate-slide-down">
          <CheckSquare className="h-4 w-4 text-primary-400 shrink-0" />
          <span className="text-sm font-medium text-primary-300">{selected.size} selected</span>
          <div className="ml-2 flex items-center gap-2 flex-wrap">
            <BulkBtn
              onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'activate' })}
              loading={bulkMutation.isPending && bulkMutation.variables?.action === 'activate'}
              icon={<PackageOpen className="h-3.5 w-3.5" />}
            >Active</BulkBtn>
            <BulkBtn
              onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'set_storage' })}
              loading={bulkMutation.isPending && bulkMutation.variables?.action === 'set_storage'}
              icon={<Package className="h-3.5 w-3.5" />}
            >Storage</BulkBtn>
            <BulkBtn
              onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'archive' })}
              loading={bulkMutation.isPending && bulkMutation.variables?.action === 'archive'}
              icon={<Archive className="h-3.5 w-3.5" />}
            >Archive</BulkBtn>
            <BulkBtn
              onClick={() => setMoveLocModal(true)}
              icon={<MapPin className="h-3.5 w-3.5" />}
            >Move to…</BulkBtn>
            <BulkBtn
              danger
              onClick={() => {
                if (getStoredGeneralPrefs().delete_confirm) {
                  setDeleteModal({ ids: [...selected] })
                } else {
                  bulkMutation.mutate({ ids: [...selected], action: 'delete' })
                }
              }}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >Delete</BulkBtn>
          </div>
          <button onClick={clearSelection} className="ml-auto text-gray-500 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Table / Grid ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-border border-t-primary-500" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Package className="h-12 w-12 text-gray-600" />
          <p className="text-sm text-gray-400">{hasFilters ? 'No spools match the current filters.' : 'No spools yet.'}</p>
          {isEditor && !hasFilters && (
            <Button size="sm" variant="secondary" onClick={() => navigate('/spools/new')}>
              <Plus className="h-4 w-4" /> Add your first spool
            </Button>
          )}
        </div>
      ) : view === 'table' ? (
        <SpoolTable
          spools={paged}
          columns={activeColumns}
          selected={selected}
          onSelectAll={selectAll}
          onSelectOne={selectOne}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
          {...rowProps}
        />
      ) : (
        <SpoolGrid
          spools={paged}
          selected={selected}
          onSelectOne={selectOne}
          {...rowProps}
        />
      )}

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {sorted.length} result{sorted.length !== 1 ? 's' : ''} · page {safePage} of {pageCount}
          </p>
          <div className="flex items-center gap-1">
            <PageBtn disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
            {pageNumbers(safePage, pageCount).map((n, i) =>
              n === '…' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-600 text-sm select-none">…</span>
              ) : (
                <PageBtn key={n} active={n === safePage} onClick={() => setPage(n as number)}>{n}</PageBtn>
              )
            )}
            <PageBtn disabled={safePage >= pageCount} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {viewSpool && (
        <SpoolDetailModal
          spool={viewSpool}
          onClose={() => setViewSpool(null)}
          onEdit={() => { setViewSpool(null); navigate(`/spools/${viewSpool.id}/edit`) }}
        />
      )}

      {loadModal && (
        <LoadPrinterModal spool={loadModal} onClose={() => setLoadModal(null)} onConfirm={handleLoadPrinter} />
      )}

      {logModal && (
        <LogUsageModal
          spool={logModal}
          onClose={() => setLogModal(null)}
          saving={logMutation.isPending}
          onConfirm={(grams, note) => logMutation.mutate({ spool: logModal, grams, note })}
        />
      )}

      {deleteModal && (
        <ConfirmDeleteModal
          count={deleteModal.ids.length}
          name={deleteModal.name}
          loading={deleteMutation.isPending || (bulkMutation.isPending && bulkMutation.variables?.action === 'delete')}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => bulkMutation.mutate({ ids: deleteModal.ids, action: 'delete' })}
        />
      )}

      {moveLocModal && (
        <BulkMoveModal
          locations={allLocations}
          count={selected.size}
          loading={bulkMutation.isPending}
          onClose={() => setMoveLocModal(false)}
          onConfirm={(locationId) => bulkMutation.mutate({ ids: [...selected], action: 'move_location', location_id: locationId })}
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  )
}

function BulkBtn({ onClick, icon, children, danger, loading }: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  danger?: boolean
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border disabled:opacity-50',
        danger
          ? 'border-red-700/50 text-red-400 hover:bg-red-900/20'
          : 'border-surface-border text-gray-300 hover:bg-surface-2 hover:text-white',
      )}
    >
      {loading
        ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
        : icon}
      {children}
    </button>
  )
}

function BulkMoveModal({
  locations, count, loading, onClose, onConfirm,
}: {
  locations: { id: number; name: string }[]
  count: number
  loading: boolean
  onClose: () => void
  onConfirm: (locationId: number | null) => void
}) {
  const [locationId, setLocationId] = useState<string>('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-1">Move to location</h2>
        <p className="text-sm text-gray-400 mb-4">
          Choose a storage location for {count} spool{count !== 1 ? 's' : ''}.
        </p>
        <div className="flex flex-col gap-1 mb-5">
          <label className="text-sm font-medium text-gray-300">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
          >
            <option value="">— No location —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={loading}
            onClick={() => onConfirm(locationId ? Number(locationId) : null)}
          >
            Move
          </Button>
        </div>
      </div>
    </div>
  )
}

function PageBtn({ onClick, disabled, active, children }: {
  onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[32px] rounded-lg px-2 py-1 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        active ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-surface-2 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}
