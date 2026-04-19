import { useState } from 'react'
import { Pencil, Trash2, MoreHorizontal, Printer, Gauge, QrCode, Copy, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatWeight } from '@/utils/format'
import { hexToColorName } from '@/utils/colors'
import type { SpoolResponse, SpoolStatus } from '@/types/api'

const STATUS_BADGE: Record<SpoolStatus, 'success' | 'warning' | 'accent' | 'default'> = {
  active: 'success', storage: 'accent', archived: 'default',
}

interface SpoolGridProps {
  spools:        SpoolResponse[]
  selected:      Set<number>
  onSelectOne:   (id: number) => void
  spoolPrinters: Record<number, string>
  isEditor:      boolean
  onView:        (s: SpoolResponse) => void
  onEdit:        (s: SpoolResponse) => void
  onDelete:      (s: SpoolResponse) => void
  onLoadPrinter: (s: SpoolResponse) => void
  onLogUsage:    (s: SpoolResponse) => void
  onPrintQR:     (s: SpoolResponse) => void
  onDuplicate:   (s: SpoolResponse) => void
}

interface CardMenuState { id: number; top: number; left: number }

export function SpoolGrid({
  spools, selected, onSelectOne,
  spoolPrinters, isEditor,
  onView, onEdit, onDelete, onLoadPrinter, onLogUsage, onPrintQR, onDuplicate,
}: SpoolGridProps) {
  const [menu, setMenu] = useState<CardMenuState | null>(null)

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: number) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({ id, top: rect.bottom + 4, left: rect.right - 180 })
    const close = () => { setMenu(null); window.removeEventListener('click', close) }
    setTimeout(() => window.addEventListener('click', close), 0)
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {spools.map((spool) => {
          const fp         = spool.filament
          const name       = spool.name ?? fp?.name ?? `Spool #${spool.id}`
          const brand      = spool.brand?.name ?? fp?.brand?.name ?? ''
          const pct        = spool.fill_percentage
          const isSelected = selected.has(spool.id)

          const colors = [fp?.color_hex, spool.extra_color_hex_2, spool.extra_color_hex_3, spool.extra_color_hex_4]
            .filter((c): c is string => Boolean(c))

          // Derived color names for display
          const colorLabel = colors.length === 1
            ? hexToColorName(colors[0])
            : colors.length > 1
              ? colors.map((c) => hexToColorName(c)).join(' · ')
              : null

          const fillColor = pct > 30 ? 'from-accent-500 to-accent-400'
            : pct > 10 ? 'from-yellow-500 to-yellow-400'
            : 'from-red-500 to-red-400'

          return (
            <div
              key={spool.id}
              onClick={() => onView(spool)}
              className={`relative group rounded-xl border bg-surface-1 p-4 flex flex-col gap-3 transition-colors cursor-pointer
                ${isSelected ? 'border-primary-500/60 bg-primary-900/10' : 'border-surface-border hover:border-primary-700/40'}`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelectOne(spool.id)}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 left-3 rounded border-surface-border bg-surface-3 accent-primary-500 cursor-pointer
                  opacity-0 group-hover:opacity-100 data-[checked]:opacity-100 transition-opacity"
                data-checked={isSelected || undefined}
              />

              {/* Header: swatches + name */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* 1–4 overlapping color circles */}
                  <div className="flex items-center shrink-0">
                    {colors.length > 0
                      ? colors.map((c, i) => (
                          <div
                            key={i}
                            className="h-8 w-8 rounded-full border-2 border-surface-1"
                            style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -10 }}
                            title={hexToColorName(c)}
                          />
                        ))
                      : <div className="h-8 w-8 rounded-full border-2 border-surface-1 bg-surface-3" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{name}</p>
                    {brand
                      ? <p className="truncate text-xs text-gray-500">{brand}</p>
                      : colorLabel && <p className="truncate text-xs text-gray-500">{colorLabel}</p>
                    }
                    {brand && colorLabel && (
                      <p className="truncate text-xs text-gray-600">{colorLabel}</p>
                    )}
                  </div>
                </div>
                <Badge variant={STATUS_BADGE[spool.status]} className="shrink-0">{spool.status}</Badge>
              </div>

              {/* Material + printer chip row */}
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-gray-300">
                  {fp?.material ?? '—'}
                </span>
                {fp?.diameter && <span className="text-xs text-gray-500">{fp.diameter}mm</span>}
                {spoolPrinters[spool.id] && (
                  <span className="ml-auto text-xs text-gray-500 truncate max-w-[80px]">
                    {spoolPrinters[spool.id]}
                  </span>
                )}
              </div>

              {/* Fill bar */}
              <div>
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>{formatWeight(spool.remaining_weight)} left</span>
                  <span className={pct > 30 ? 'text-gray-300' : pct > 10 ? 'text-yellow-400' : 'text-red-400'}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${fillColor} transition-all`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-0.5 -mb-1" onClick={(e) => e.stopPropagation()}>
                {isEditor && (
                  <button
                    title="Log usage"
                    onClick={() => onLogUsage(spool)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:bg-surface-2 hover:text-white transition-colors mr-auto"
                  >
                    <Minus className="h-3 w-3" /> Log use
                  </button>
                )}
                {isEditor && <CardBtn title="Edit"   onClick={() => onEdit(spool)}><Pencil className="h-3.5 w-3.5" /></CardBtn>}
                {isEditor && <CardBtn title="Delete" danger onClick={() => onDelete(spool)}><Trash2 className="h-3.5 w-3.5" /></CardBtn>}
                {isEditor && <CardBtn title="More"   onClick={(e) => openMenu(e, spool.id)}><MoreHorizontal className="h-3.5 w-3.5" /></CardBtn>}
              </div>
            </div>
          )
        })}
      </div>

      {menu && (
        <div
          className="fixed z-50 w-44 rounded-xl border border-surface-border bg-surface-1 shadow-2xl py-1"
          style={{ top: menu.top, left: menu.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const spool = spools.find((s) => s.id === menu.id)
            if (!spool) return null
            return (
              <>
                <CardMenuItem icon={<Printer className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onLoadPrinter(spool) }}>Load to printer</CardMenuItem>
                <CardMenuItem icon={<Gauge   className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onLogUsage(spool) }}>Log usage</CardMenuItem>
                <CardMenuItem icon={<QrCode  className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onPrintQR(spool) }}>Print QR label</CardMenuItem>
                <div className="my-1 border-t border-surface-border" />
                <CardMenuItem icon={<Copy   className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onDuplicate(spool) }}>Duplicate spool</CardMenuItem>
              </>
            )
          })()}
        </div>
      )}
    </>
  )
}

function CardBtn({ title, onClick, danger = false, children }: {
  title: string; onClick: React.MouseEventHandler<HTMLButtonElement>; danger?: boolean; children: React.ReactNode
}) {
  return (
    <button title={title} onClick={onClick}
      className={`rounded p-1.5 transition-colors ${danger
        ? 'text-gray-500 hover:bg-red-900/30 hover:text-red-400'
        : 'text-gray-500 hover:bg-surface-3 hover:text-gray-200'}`}
    >
      {children}
    </button>
  )
}

function CardMenuItem({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors"
    >
      <span className="text-gray-500">{icon}</span>
      {children}
    </button>
  )
}
