import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Calculator, ChevronDown, ChevronUp, Package,
  Trash2, Save, Zap, TrendingUp, Clock,
} from 'lucide-react'
import { spoolsApi } from '@/api/spools'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'
import type { SpoolResponse } from '@/types/api'

// ── Persistence ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fh_cost_estimates'

interface SavedEstimate {
  id: string
  name: string
  date: string
  spoolName?: string
  costPerKg: number
  modelWeight: number
  printTimeSeconds: number
  wattage?: number
  electricityRate?: number
  markup?: number
  filamentCost: number
  electricityCost: number
  subtotal: number
  markupAmount: number
  total: number
}

function loadEstimates(): SavedEstimate[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function persistEstimates(list: SavedEstimate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function spoolCostPerKg(s: SpoolResponse): number | null {
  if (s.purchase_price && s.initial_weight) {
    return (s.purchase_price / s.initial_weight) * 1000
  }
  return null
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="text-sm font-medium text-gray-300">
      {children}
      {hint && <span className="ml-1 text-gray-500 font-normal text-xs">{hint}</span>}
    </label>
  )
}

function NumberInput({
  value, onChange, placeholder, prefix, suffix, step = 'any', min = '0',
}: {
  value: string; onChange: (v: string) => void
  placeholder?: string; prefix?: string; suffix?: string
  step?: string; min?: string
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">{prefix}</span>
      )}
      <input
        type="number"
        min={min}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-lg border border-surface-border bg-surface-2 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none',
          prefix ? 'pl-7 pr-3' : 'px-3',
          suffix ? 'pr-8' : '',
        )}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">{suffix}</span>
      )}
    </div>
  )
}

function ResultRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between', muted && 'opacity-60')}>
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-white tabular-nums">${value.toFixed(4)}</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CostEstimatorPage() {
  // Source toggle
  const [useInventory, setUseInventory] = useState(false)
  const [selectedSpool, setSelectedSpool] = useState<SpoolResponse | null>(null)

  // Basic inputs
  const [costPerKg,   setCostPerKg]   = useState('')
  const [modelWeight, setModelWeight] = useState('')
  const [printHours,   setPrintHours]   = useState('')
  const [printMinutes, setPrintMinutes] = useState('')
  const [printSeconds, setPrintSeconds] = useState('')

  // Advanced
  const [showAdvanced,     setShowAdvanced]     = useState(false)
  const [wattage,          setWattage]          = useState('')
  const [electricityRate,  setElectricityRate]  = useState('')
  const [markup,           setMarkup]           = useState('')

  // Save
  const [estimateName,   setEstimateName]   = useState('')
  const [savedEstimates, setSavedEstimates] = useState<SavedEstimate[]>(loadEstimates)

  // ── Inventory query ────────────────────────────────────────────────────────

  const { data: spoolsPage } = useQuery({
    queryKey: ['spools', 'active-storage'],
    queryFn:  () => spoolsApi.list({ status: 'active,storage', page_size: 200 }),
    enabled:  useInventory,
  })
  const spools = spoolsPage?.items ?? []

  // ── Effective cost per kg ──────────────────────────────────────────────────

  const effectiveCostPerKg = useMemo(() => {
    if (useInventory && selectedSpool) {
      return spoolCostPerKg(selectedSpool) ?? 0
    }
    return parseFloat(costPerKg) || 0
  }, [useInventory, selectedSpool, costPerKg])

  // ── Live calculation ───────────────────────────────────────────────────────

  const calc = useMemo(() => {
    const weightG    = parseFloat(modelWeight) || 0
    const timeSecs   = (parseInt(printHours)   || 0) * 3600
                     + (parseInt(printMinutes) || 0) * 60
                     + (parseInt(printSeconds) || 0)
    const timeHours  = timeSecs / 3600
    const cpkg       = effectiveCostPerKg

    const filamentCost  = (weightG / 1000) * cpkg
    const elecCost      = wattage && electricityRate
      ? (parseFloat(wattage) / 1000) * timeHours * parseFloat(electricityRate)
      : 0
    const subtotal      = filamentCost + elecCost
    const markupPct     = parseFloat(markup) || 0
    const markupAmt     = subtotal * (markupPct / 100)
    const total         = subtotal + markupAmt

    return { filamentCost, elecCost, subtotal, markupAmt, total, timeSecs, weightG, cpkg }
  }, [effectiveCostPerKg, modelWeight, printHours, printMinutes, printSeconds, wattage, electricityRate, markup])

  const hasResult = calc.weightG > 0 || calc.timeSecs > 0 || effectiveCostPerKg > 0

  // ── Save / delete ──────────────────────────────────────────────────────────

  function handleSave() {
    if (!hasResult) return
    const entry: SavedEstimate = {
      id:               crypto.randomUUID(),
      name:             estimateName.trim() || `Estimate ${savedEstimates.length + 1}`,
      date:             new Date().toISOString(),
      spoolName:        useInventory && selectedSpool
                          ? (selectedSpool.name ?? `Spool #${selectedSpool.id}`)
                          : undefined,
      costPerKg:        calc.cpkg,
      modelWeight:      calc.weightG,
      printTimeSeconds: calc.timeSecs,
      wattage:          parseFloat(wattage)         || undefined,
      electricityRate:  parseFloat(electricityRate) || undefined,
      markup:           parseFloat(markup)          || undefined,
      filamentCost:     calc.filamentCost,
      electricityCost:  calc.elecCost,
      subtotal:         calc.subtotal,
      markupAmount:     calc.markupAmt,
      total:            calc.total,
    }
    const next = [entry, ...savedEstimates]
    setSavedEstimates(next)
    persistEstimates(next)
    setEstimateName('')
  }

  function deleteEstimate(id: string) {
    const next = savedEstimates.filter((e) => e.id !== id)
    setSavedEstimates(next)
    persistEstimates(next)
  }

  function loadEstimate(e: SavedEstimate) {
    setUseInventory(false)
    setSelectedSpool(null)
    setCostPerKg(String(e.costPerKg))
    setModelWeight(String(e.modelWeight))
    setPrintHours(String(Math.floor(e.printTimeSeconds / 3600)))
    setPrintMinutes(String(Math.floor((e.printTimeSeconds % 3600) / 60)))
    setPrintSeconds(String(e.printTimeSeconds % 60))
    setWattage(e.wattage         ? String(e.wattage)         : '')
    setElectricityRate(e.electricityRate ? String(e.electricityRate) : '')
    setMarkup(e.markup           ? String(e.markup)           : '')
    if (e.wattage || e.electricityRate || e.markup) setShowAdvanced(true)
  }

  const selectCls = 'w-full rounded-lg border border-surface-border bg-surface-2 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none'

  return (
    <div className="p-5 lg:p-7 space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white">Print Cost Estimator</h2>
        <p className="mt-0.5 text-sm text-gray-400">Calculate the cost to print a file based on filament, time, and electricity.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">

        {/* ── Left: calculator ── */}
        <div className="space-y-4">

          {/* Filament card */}
          <div className="rounded-xl border border-surface-border bg-surface-1 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Filament</h3>

            {/* Source toggle */}
            <div className="flex rounded-lg border border-surface-border bg-surface-2 p-0.5 w-fit">
              <button
                onClick={() => { setUseInventory(false); setSelectedSpool(null) }}
                className={cn('rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  !useInventory ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}
              >
                Manual
              </button>
              <button
                onClick={() => setUseInventory(true)}
                className={cn('rounded px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5',
                  useInventory ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}
              >
                <Package className="h-3.5 w-3.5" />
                Use inventory
              </button>
            </div>

            {/* Manual cost input */}
            {!useInventory && (
              <div className="space-y-1.5">
                <FieldLabel hint="($ per kg)">Filament cost</FieldLabel>
                <NumberInput value={costPerKg} onChange={setCostPerKg} placeholder="25.00" prefix="$" step="0.01" />
              </div>
            )}

            {/* Inventory spool picker */}
            {useInventory && (
              <div className="space-y-2">
                <FieldLabel>Select spool</FieldLabel>
                <select
                  value={selectedSpool?.id ?? ''}
                  onChange={(e) => {
                    const found = spools.find((s) => s.id === Number(e.target.value)) ?? null
                    setSelectedSpool(found)
                  }}
                  className={selectCls}
                >
                  <option value="">— Select a spool —</option>
                  {spools.map((s) => {
                    const label    = s.name ?? s.filament?.name ?? `Spool #${s.id}`
                    const mat      = s.filament?.material ?? ''
                    const cpkg     = spoolCostPerKg(s)
                    const priceStr = cpkg ? ` · $${cpkg.toFixed(2)}/kg` : ''
                    return (
                      <option key={s.id} value={s.id}>
                        {label}{mat ? ` · ${mat}` : ''} ({Math.round(s.remaining_weight)}g left{priceStr})
                      </option>
                    )
                  })}
                </select>

                {selectedSpool && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {spoolCostPerKg(selectedSpool) != null ? (
                      <div className="rounded-lg bg-surface-2 border border-surface-border px-3 py-1.5 text-xs">
                        <span className="text-gray-500">Cost/kg: </span>
                        <span className="text-white font-semibold">${spoolCostPerKg(selectedSpool)!.toFixed(2)}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-yellow-400">No purchase price set on this spool — add one in your inventory for an accurate estimate.</p>
                    )}
                    <div className="rounded-lg bg-surface-2 border border-surface-border px-3 py-1.5 text-xs">
                      <span className="text-gray-500">Remaining: </span>
                      <span className="text-white font-semibold">{Math.round(selectedSpool.remaining_weight)}g</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Model weight */}
            <div className="space-y-1.5">
              <FieldLabel hint="(grams)">Model weight</FieldLabel>
              <NumberInput value={modelWeight} onChange={setModelWeight} placeholder="50" suffix="g" step="0.1" />
            </div>

            {/* Print time */}
            <div className="space-y-1.5">
              <FieldLabel>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-gray-500" />
                  Print time
                </span>
              </FieldLabel>
              <div className="flex items-end gap-1.5">
                {([
                  { label: 'Hours',   value: printHours,   set: setPrintHours,   max: '999' },
                  { label: 'Min',     value: printMinutes, set: setPrintMinutes, max: '59'  },
                  { label: 'Sec',     value: printSeconds, set: setPrintSeconds, max: '59'  },
                ] as const).map(({ label, value, set, max }) => (
                  <div key={label} className="space-y-0.5 w-20">
                    <p className="text-xs text-gray-500">{label}</p>
                    <input
                      type="number"
                      min="0"
                      max={max}
                      placeholder="0"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full rounded-md border border-surface-border bg-surface-2 px-2 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none text-center"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced options */}
          <div className="rounded-xl border border-surface-border bg-surface-1 overflow-hidden">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-white hover:bg-surface-2 transition-colors"
            >
              Advanced options
              {showAdvanced
                ? <ChevronUp   className="h-4 w-4 text-gray-500" />
                : <ChevronDown className="h-4 w-4 text-gray-500" />}
            </button>

            {showAdvanced && (
              <div className="border-t border-surface-border px-5 pt-4 pb-5 space-y-5">

                {/* Electricity */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    <span className="text-sm font-medium text-gray-300">Electricity</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <FieldLabel hint="(W)">Printer wattage</FieldLabel>
                      <NumberInput value={wattage} onChange={setWattage} placeholder="200" suffix="W" />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel hint="($/kWh)">Electricity rate</FieldLabel>
                      <NumberInput value={electricityRate} onChange={setElectricityRate} placeholder="0.12" prefix="$" step="0.001" />
                    </div>
                  </div>
                </div>

                {/* Markup */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-medium text-gray-300">Markup / selling price</span>
                  </div>
                  <div className="w-1/2 space-y-1.5">
                    <FieldLabel hint="(%)">Markup percentage</FieldLabel>
                    <NumberInput value={markup} onChange={setMarkup} placeholder="20" suffix="%" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results card */}
          {hasResult && (
            <div className="rounded-xl border border-primary-700/40 bg-primary-900/20 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary-400" />
                Cost breakdown
              </h3>

              <div className="space-y-2">
                <ResultRow label="Filament cost" value={calc.filamentCost} />
                {calc.elecCost > 0 && (
                  <ResultRow label="Electricity cost" value={calc.elecCost} />
                )}
                {calc.elecCost > 0 && (
                  <ResultRow label="Subtotal" value={calc.subtotal} muted />
                )}
                {calc.markupAmt > 0 && (
                  <ResultRow label={`Markup (${markup}%)`} value={calc.markupAmt} />
                )}
              </div>

              <div className="flex items-center justify-between border-t border-primary-700/40 pt-4">
                <span className="text-base font-semibold text-white">
                  {calc.markupAmt > 0 ? 'Selling price' : 'Total cost'}
                </span>
                <span className="text-3xl font-bold text-primary-300 tabular-nums">
                  ${calc.total.toFixed(2)}
                </span>
              </div>
              {calc.markupAmt > 0 && (
                <p className="text-xs text-gray-500 -mt-2 text-right">Base cost: ${calc.subtotal.toFixed(4)}</p>
              )}

              {/* Save row */}
              <div className="border-t border-primary-700/40 pt-4 flex gap-2">
                <input
                  type="text"
                  placeholder="Name this estimate (optional)"
                  value={estimateName}
                  onChange={(e) => setEstimateName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  className="flex-1 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                />
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: saved estimates ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            Saved Estimates
            {savedEstimates.length > 0 && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-gray-400 font-normal">
                {savedEstimates.length}
              </span>
            )}
          </h3>

          {savedEstimates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-border bg-surface-1 py-14 text-center">
              <Calculator className="h-8 w-8 text-gray-600" />
              <div>
                <p className="text-sm text-gray-400">No saved estimates yet.</p>
                <p className="text-xs text-gray-500 mt-0.5">Fill in the calculator and click Save.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {savedEstimates.map((e) => (
                <div
                  key={e.id}
                  onClick={() => loadEstimate(e)}
                  className="rounded-xl border border-surface-border bg-surface-1 px-4 py-3 cursor-pointer hover:bg-surface-2 hover:border-primary-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{e.name}</p>
                      {e.spoolName && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Package className="h-3 w-3 shrink-0" />{e.spoolName}
                        </p>
                      )}
                      <p className="text-xs text-gray-600 mt-0.5">
                        {format(new Date(e.date), 'MMM d, yyyy · h:mm a')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xl font-bold text-primary-300 tabular-nums">
                        ${e.total.toFixed(2)}
                      </span>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); deleteEstimate(e.id) }}
                        className="rounded-lg p-1.5 text-gray-600 hover:bg-red-950/30 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-500">
                    {e.modelWeight > 0 && <span>{e.modelWeight}g filament</span>}
                    {e.printTimeSeconds > 0 && <span>· {formatTime(e.printTimeSeconds)}</span>}
                    {e.electricityCost > 0 && <span>· +${e.electricityCost.toFixed(4)} elec.</span>}
                    {e.markup && <span>· {e.markup}% markup</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
