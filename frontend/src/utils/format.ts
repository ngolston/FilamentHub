import { formatDistanceToNow, format, parseISO } from 'date-fns'

export function formatWeight(grams: number, unit = 'g'): string {
  if (unit === 'kg') return `${(grams / 1000).toFixed(2)} kg`
  return `${grams.toFixed(0)} g`
}

export function formatTemp(celsius: number, unit = 'C'): string {
  if (unit === 'F') return `${Math.round(celsius * 9/5 + 32)}°F`
  return `${Math.round(celsius)}°C`
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy')
  } catch {
    return iso
  }
}

export function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function fillColor(pct: number): string {
  if (pct > 50) return 'bg-accent-500'
  if (pct > 20) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400'
    case 'warning':  return 'text-yellow-400'
    default:         return 'text-accent-400'
  }
}
