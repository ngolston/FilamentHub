import { cn } from '@/utils/cn'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-5 w-5 animate-spin text-primary-400', className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <Spinner className="h-10 w-10" />
    </div>
  )
}
