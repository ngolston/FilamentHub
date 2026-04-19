import { api } from './client'
import type { UsageSummary, SpoolForecast } from '@/types/api'

// ── Extended analytics types ──────────────────────────────────────────────────

export interface DailyPoint {
  date: string
  grams: number
  cumulative: number
}

export interface MaterialBreakdown {
  material: string
  total_grams: number
  pct: number
  avg_daily_g: number
}

export interface MaterialAnalytics {
  breakdown: MaterialBreakdown[]
  weekly: Record<string, number | string>[]
  materials: string[]
}

export interface PrinterStat {
  printer_id: number | null
  printer_name: string
  total_grams: number
  pct: number
  top_materials: string[]
}

export interface PrinterAnalytics {
  stats: PrinterStat[]
  daily: Record<string, number | string>[]
}

export interface MonthlySpend {
  month: string
  spend: number
}

export interface MaterialCost {
  material: string
  cost_per_kg: number
  total_spent: number
}

export interface CostAnalytics {
  total_invested: number
  blended_cost_per_kg: number
  this_month_spend: number
  projected_monthly: number
  monthly_history: MonthlySpend[]
  cost_by_material: MaterialCost[]
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const analyticsApi = {
  summary: (days = 30) =>
    api.get<UsageSummary>('/analytics/summary', { params: { days } }).then((r) => r.data),

  forecast: () =>
    api.get<SpoolForecast[]>('/analytics/forecast').then((r) => r.data),

  daily: (days = 30) =>
    api.get<DailyPoint[]>('/analytics/daily', { params: { days } }).then((r) => r.data),

  byMaterial: (days = 30) =>
    api.get<MaterialAnalytics>('/analytics/by-material', { params: { days } }).then((r) => r.data),

  byPrinter: (days = 30) =>
    api.get<PrinterAnalytics>('/analytics/by-printer', { params: { days } }).then((r) => r.data),

  cost: () =>
    api.get<CostAnalytics>('/analytics/cost').then((r) => r.data),
}
