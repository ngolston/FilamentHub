import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/utils/cn'
import type { AlertRuleResponse, AlertRuleCreate, AlertRuleUpdate } from '@/types/api'

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'HIPS', 'PLA-CF', 'PETG-CF']

interface Props {
  rule?: AlertRuleResponse
  onClose: () => void
  onSave: (data: AlertRuleCreate | AlertRuleUpdate) => void
  isSaving: boolean
}

export function AlertRuleModal({ rule, onClose, onSave, isSaving }: Props) {
  const isEditing = !!rule

  const [name,             setName]            = useState(rule?.name ?? '')
  const [lowPct,           setLowPct]          = useState(String(rule?.low_threshold_pct ?? 20))
  const [criticalPct,      setCriticalPct]     = useState(String(rule?.critical_threshold_pct ?? 10))
  const [materialFilter,   setMaterialFilter]  = useState(rule?.material_filter ?? '')
  const [notifyDiscord,    setNotifyDiscord]   = useState(rule?.notify_discord ?? true)
  const [notifyEmail,      setNotifyEmail]     = useState(rule?.notify_email ?? false)
  const [errors,           setErrors]          = useState<Record<string, string>>({})

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function validate() {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    const low = parseFloat(lowPct)
    const crit = parseFloat(criticalPct)
    if (isNaN(low) || low < 1 || low > 99)   errs.low = 'Must be 1–99'
    if (isNaN(crit) || crit < 1 || crit > 99) errs.critical = 'Must be 1–99'
    if (!isNaN(low) && !isNaN(crit) && crit >= low) errs.critical = 'Critical must be lower than Low threshold'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave({
      name: name.trim(),
      low_threshold_pct:      parseFloat(lowPct),
      critical_threshold_pct: parseFloat(criticalPct),
      material_filter: materialFilter.trim() || null,
      notify_discord:  notifyDiscord,
      notify_email:    notifyEmail,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-1 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 className="text-base font-semibold text-white">
            {isEditing ? 'Edit alert rule' : 'New alert rule'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          <Input
            label="Rule name"
            placeholder="e.g. Low PLA stock"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />

          {/* Thresholds */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-300">Low threshold (%)</label>
              <input
                type="number"
                min={1}
                max={99}
                step={1}
                value={lowPct}
                onChange={(e) => setLowPct(e.target.value)}
                className={cn(
                  'w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-white',
                  'placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
                  errors.low ? 'border-red-500' : 'border-surface-border focus:border-primary-500',
                )}
              />
              {errors.low && <p className="text-xs text-red-400">{errors.low}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-300">Critical threshold (%)</label>
              <input
                type="number"
                min={1}
                max={99}
                step={1}
                value={criticalPct}
                onChange={(e) => setCriticalPct(e.target.value)}
                className={cn(
                  'w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-white',
                  'placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
                  errors.critical ? 'border-red-500' : 'border-surface-border focus:border-primary-500',
                )}
              />
              {errors.critical && <p className="text-xs text-red-400">{errors.critical}</p>}
            </div>
          </div>

          {/* Material filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Material filter <span className="text-gray-500 font-normal">(optional — leave blank for all)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMaterialFilter('')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  materialFilter === ''
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-2 text-gray-400 hover:text-white border border-surface-border',
                )}
              >
                All
              </button>
              {MATERIALS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMaterialFilter(m === materialFilter ? '' : m)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    materialFilter === m
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-2 text-gray-400 hover:text-white border border-surface-border',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="space-y-3 rounded-xl border border-surface-border bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Notifications</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Discord webhook</p>
                <p className="text-xs text-gray-500">Post to your Discord channel</p>
              </div>
              <Toggle checked={notifyDiscord} onChange={setNotifyDiscord} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Email</p>
                <p className="text-xs text-gray-500">Send to your account email</p>
              </div>
              <Toggle checked={notifyEmail} onChange={setNotifyEmail} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isSaving}>
              {isEditing ? 'Save changes' : 'Create rule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
