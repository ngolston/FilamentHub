import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Pencil, Trash2, MoreHorizontal, Printer, Gauge, QrCode, Copy, Minus } from 'lucide-react'
import type { SpoolResponse } from '@/types/api'

export type SortKey = 'name' | 'material' | 'status' | 'fill_pct' | 'remaining' | 'last_used'

// ── Column definition ─────────────────────────────────────────────────────────

export interface ColumnDef {
  key:          string
  label:        string
  sortKey?:     SortKey
  thClassName?: string
  tdClassName?: string
  render:       (spool: SpoolResponse) => React.ReactNode
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SpoolTableProps {
  spools:        SpoolResponse[]
  columns:       ColumnDef[]
  selected:      Set<number>
  onSelectAll:   (checked: boolean) => void
  onSelectOne:   (id: number) => void
  sortBy:        SortKey
  sortDir:       'asc' | 'desc'
  onSort:        (col: SortKey) => void
  isEditor:      boolean
  onView:        (s: SpoolResponse) => void
  onEdit:        (s: SpoolResponse) => void
  onDelete:      (s: SpoolResponse) => void
  onLoadPrinter: (s: SpoolResponse) => void
  onLogUsage:    (s: SpoolResponse) => void
  onPrintQR:     (s: SpoolResponse) => void
  onDuplicate:   (s: SpoolResponse) => void
}

// ── Sort header cell ──────────────────────────────────────────────────────────

function SortTh({ col, active, dir, onSort, className = '', children }: {
  col: SortKey; active: boolean; dir: 'asc' | 'desc'
  onSort: (c: SortKey) => void; className?: string; children: React.ReactNode
}) {
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none
        ${active ? 'text-primary-400' : 'text-gray-500 hover:text-gray-300'} ${className}`}
    >
      <span className="flex items-center gap-1">
        {children}
        {active
          ? dir === 'asc'
            ? <ChevronUp   className="h-3 w-3 text-primary-400" />
            : <ChevronDown className="h-3 w-3 text-primary-400" />
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface MenuState { id: number; top: number; left: number }

export function SpoolTable({
  spools, columns, selected, onSelectAll, onSelectOne,
  sortBy, sortDir, onSort,
  isEditor,
  onView, onEdit, onDelete, onLoadPrinter, onLogUsage, onPrintQR, onDuplicate,
}: SpoolTableProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: number) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({ id, top: rect.bottom + 4, left: rect.right - 180 })
    const close = () => { setMenu(null); window.removeEventListener('click', close) }
    setTimeout(() => window.addEventListener('click', close), 0)
  }

  const allSelected  = spools.length > 0 && spools.every((s) => selected.has(s.id))
  const someSelected = spools.some((s) => selected.has(s.id)) && !allSelected

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-2 border-b border-surface-border">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-surface-border bg-surface-3 accent-primary-500 cursor-pointer"
                />
              </th>

              {columns.map((col) =>
                col.sortKey ? (
                  <SortTh
                    key={col.key}
                    col={col.sortKey}
                    active={sortBy === col.sortKey}
                    dir={sortDir}
                    onSort={onSort}
                    className={col.thClassName ?? ''}
                  >
                    {col.label}
                  </SortTh>
                ) : (
                  <th
                    key={col.key}
                    className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 ${col.thClassName ?? ''}`}
                  >
                    {col.label}
                  </th>
                )
              )}

              {/* Actions column */}
              <th className="w-24 px-3 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-surface-border">
            {spools.map((spool) => {
              const isSelected = selected.has(spool.id)
              return (
                <tr
                  key={spool.id}
                  onClick={() => onView(spool)}
                  className={`group transition-colors cursor-pointer ${isSelected ? 'bg-primary-900/10' : 'hover:bg-surface-2'}`}
                >
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelectOne(spool.id)}
                      className="rounded border-surface-border bg-surface-3 accent-primary-500 cursor-pointer"
                    />
                  </td>

                  {columns.map((col) => (
                    <td key={col.key} className={`px-3 py-3 ${col.tdClassName ?? ''}`}>
                      {col.render(spool)}
                    </td>
                  ))}

                  {/* Inline actions — only show on hover */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isEditor && (
                        <button
                          title="Log usage"
                          onClick={() => onLogUsage(spool)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:bg-surface-3 hover:text-white transition-colors"
                        >
                          <Minus className="h-3 w-3" /> Log use
                        </button>
                      )}
                      {isEditor && <ActionBtn title="Edit"   onClick={() => onEdit(spool)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>}
                      {isEditor && <ActionBtn title="Delete" danger onClick={() => onDelete(spool)}><Trash2 className="h-3.5 w-3.5" /></ActionBtn>}
                      {isEditor && (
                        <ActionBtn title="More" onClick={(e) => openMenu(e, spool.id)}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}

            {spools.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="py-12 text-center text-sm text-gray-500">
                  No spools match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
                <MenuItem icon={<Printer className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onLoadPrinter(spool) }}>Load to printer</MenuItem>
                <MenuItem icon={<Gauge   className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onLogUsage(spool) }}>Log usage</MenuItem>
                <MenuItem icon={<QrCode  className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onPrintQR(spool) }}>Print QR label</MenuItem>
                <div className="my-1 border-t border-surface-border" />
                <MenuItem icon={<Copy   className="h-3.5 w-3.5" />} onClick={() => { setMenu(null); onDuplicate(spool) }}>Duplicate spool</MenuItem>
              </>
            )
          })()}
        </div>
      )}
    </>
  )
}

function ActionBtn({ title, onClick, danger = false, children }: {
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

function MenuItem({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-surface-2 hover:text-white transition-colors"
    >
      <span className="text-gray-500">{icon}</span>
      {children}
    </button>
  )
}
