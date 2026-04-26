import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell, BellOff, Plus, Trash2, Pencil, AlertTriangle,
  Package, CheckCircle,
} from 'lucide-react'
import { alertsApi } from '@/api/alerts'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/utils/cn'
import type { AlertRuleResponse, AlertRuleCreate, AlertRuleUpdate, TriggeredAlert } from '@/types/api'
import { AlertRuleModal } from './AlertRuleModal'

// ── Triggered alert card ──────────────────────────────────────────────────────

function TriggeredCard({ alert }: { alert: TriggeredAlert }) {
  const isCritical = alert.severity === 'critical'
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border p-4 transition-colors',
        isCritical
          ? 'border-red-700/40 bg-red-950/20'
          : 'border-amber-700/40 bg-amber-950/20',
      )}
    >
      {/* Color swatch / fallback icon */}
      {alert.color_hex ? (
        <div
          className="h-10 w-10 shrink-0 rounded-lg border border-black/20"
          style={{ backgroundColor: alert.color_hex }}
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <Package className="h-5 w-5 text-gray-500" />
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white truncate">{alert.spool_name}</span>
          <span
            className={cn(
              'rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide',
              isCritical
                ? 'bg-red-900/60 text-red-300'
                : 'bg-amber-900/60 text-amber-300',
            )}
          >
            {alert.severity}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          {[alert.material, alert.brand_name].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Rule: <span className="text-gray-400">{alert.rule_name}</span>
        </p>
      </div>

      {/* Fill bar + stats */}
      <div className="shrink-0 w-28 text-right">
        <p className={cn(
          'text-lg font-bold tabular-nums',
          isCritical ? 'text-red-400' : 'text-amber-400',
        )}>
          {alert.remaining_pct}%
        </p>
        <p className="text-xs text-gray-500">{alert.remaining_g}g left</p>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isCritical ? 'bg-red-500' : 'bg-amber-500',
            )}
            style={{ width: `${Math.min(100, alert.remaining_pct)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Alert rule row ────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: AlertRuleResponse
  onEdit: () => void
  onDelete: () => void
  onToggle: (active: boolean) => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-1 px-4 py-3">
      <Toggle checked={rule.is_active} onChange={onToggle} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'text-sm font-medium',
            rule.is_active ? 'text-white' : 'text-gray-500',
          )}>
            {rule.name}
          </span>
          {rule.material_filter && (
            <Badge variant="primary">{rule.material_filter}</Badge>
          )}
          {rule.triggered_count > 0 && rule.is_active && (
            <span className="flex items-center gap-1 rounded-full bg-red-900/40 px-2 py-px text-[10px] font-semibold text-red-400">
              <AlertTriangle className="h-3 w-3" />
              {rule.triggered_count} triggered
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          Low ≤ {rule.low_threshold_pct}% &nbsp;·&nbsp; Critical ≤ {rule.critical_threshold_pct}%
          {rule.notify_discord && <span> &nbsp;·&nbsp; Discord</span>}
          {rule.notify_email && <span> &nbsp;·&nbsp; Email</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onEdit}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-surface-2 hover:text-gray-200 transition-colors"
          title="Edit rule"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
          title="Delete rule"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const qc = useQueryClient()
  const [modalRule, setModalRule] = useState<AlertRuleResponse | null | undefined>(undefined)
  // undefined = closed, null = new, AlertRuleResponse = editing

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: alertsApi.listRules,
  })

  const { data: triggered = [], isLoading: triggeredLoading } = useQuery({
    queryKey: ['alert-triggered'],
    queryFn: alertsApi.getTriggered,
    refetchInterval: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: alertsApi.createRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }); setModalRule(undefined) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AlertRuleUpdate }) => alertsApi.updateRule(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }); setModalRule(undefined) },
  })

  const deleteMutation = useMutation({
    mutationFn: alertsApi.deleteRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })

  const totalTriggered = triggered.length
  const criticalCount  = triggered.filter((t) => t.severity === 'critical').length

  return (
    <div className="p-5 lg:p-7 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Alerts</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Get notified when spools run low. Create rules that match by material and notify via Discord or email.
          </p>
        </div>
        <Button onClick={() => setModalRule(null)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          New rule
        </Button>
      </div>

      {/* Summary chips */}
      {!triggeredLoading && (
        <div className="flex flex-wrap gap-3">
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5',
            criticalCount > 0
              ? 'border-red-700/40 bg-red-950/20'
              : 'border-surface-border bg-surface-1',
          )}>
            <AlertTriangle className={cn(
              'h-4 w-4',
              criticalCount > 0 ? 'text-red-400' : 'text-gray-600',
            )} />
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              criticalCount > 0 ? 'text-red-300' : 'text-gray-500',
            )}>
              {criticalCount} critical
            </span>
          </div>
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5',
            totalTriggered > 0
              ? 'border-amber-700/40 bg-amber-950/20'
              : 'border-surface-border bg-surface-1',
          )}>
            <Bell className={cn(
              'h-4 w-4',
              totalTriggered > 0 ? 'text-amber-400' : 'text-gray-600',
            )} />
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              totalTriggered > 0 ? 'text-amber-300' : 'text-gray-500',
            )}>
              {totalTriggered} triggered
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-1 px-4 py-2.5">
            <CheckCircle className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-500 tabular-nums">
              {rules.filter((r) => r.is_active).length} active rule{rules.filter((r) => r.is_active).length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Active alerts section */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Active Alerts
        </h3>
        {triggeredLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : triggered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-surface-border bg-surface-1 py-10 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
            <p className="text-sm font-medium text-gray-300">All spools are well-stocked</p>
            <p className="text-xs text-gray-500">No spools are currently below any threshold.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {triggered.map((alert) => (
              <TriggeredCard key={`${alert.rule_id}-${alert.spool_id}`} alert={alert} />
            ))}
          </div>
        )}
      </section>

      {/* Alert rules section */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Alert Rules
        </h3>
        {rulesLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-surface-border bg-surface-1 py-10 text-center">
            <BellOff className="h-8 w-8 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-300">No alert rules yet</p>
              <p className="text-xs text-gray-500 mt-0.5">Create a rule to get notified when spools run low.</p>
            </div>
            <Button variant="secondary" onClick={() => setModalRule(null)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create first rule
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onEdit={() => setModalRule(rule)}
                onDelete={() => deleteMutation.mutate(rule.id)}
                onToggle={(active) => updateMutation.mutate({ id: rule.id, data: { is_active: active } })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create / edit modal */}
      {modalRule !== undefined && (
        <AlertRuleModal
          rule={modalRule ?? undefined}
          onClose={() => setModalRule(undefined)}
          onSave={(data) => {
            if (modalRule) {
              updateMutation.mutate({ id: modalRule.id, data })
            } else {
              createMutation.mutate(data as AlertRuleCreate)
            }
          }}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}
