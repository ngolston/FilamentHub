import { cn } from '@/utils/cn'
import { type HTMLAttributes } from 'react'

const variants = {
  default:  'bg-surface-3 text-gray-300',
  primary:  'bg-primary-900/60 text-primary-300 border border-primary-700/50',
  accent:   'bg-accent-900/60 text-accent-300 border border-accent-700/50',
  success:  'bg-green-900/60 text-green-300 border border-green-700/50',
  warning:  'bg-yellow-900/60 text-yellow-300 border border-yellow-700/50',
  danger:   'bg-red-900/60 text-red-300 border border-red-700/50',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
