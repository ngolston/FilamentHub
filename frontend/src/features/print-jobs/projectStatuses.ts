export interface StatusEntry {
  name: string
  color: string
  custom?: boolean
}

export const BUILTIN_STATUSES: StatusEntry[] = [
  { name: 'Needs to be Researched',      color: '#6b7280' },
  { name: 'Needs to be Designed',        color: '#8b5cf6' },
  { name: 'Needs to be Sliced',          color: '#f59e0b' },
  { name: 'Currently Printing',          color: '#3b82f6' },
  { name: 'Waiting to Assemble',         color: '#06b6d4' },
  { name: 'Finished - Delivery Pending', color: '#f97316' },
  { name: 'Delivered / Archived',        color: '#10b981' },
]

export const CUSTOM_STATUSES_KEY = 'fh-custom-project-statuses'

export function getCustomStatuses(): StatusEntry[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_STATUSES_KEY) ?? '[]') }
  catch { return [] }
}

export function saveCustomStatuses(s: StatusEntry[]): void {
  localStorage.setItem(CUSTOM_STATUSES_KEY, JSON.stringify(s))
}

export function getAllStatuses(): StatusEntry[] {
  return [...BUILTIN_STATUSES, ...getCustomStatuses()]
}

export function statusColor(name: string | null): string {
  if (!name) return '#6b7280'
  return getAllStatuses().find((s) => s.name === name)?.color ?? '#6b7280'
}
