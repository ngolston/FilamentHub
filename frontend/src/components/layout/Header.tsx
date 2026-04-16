import { Menu } from 'lucide-react'

interface HeaderProps {
  title: string
  onMenuClick: () => void
  actions?: React.ReactNode
}

export function Header({ title, onMenuClick, actions }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-surface-border bg-surface-1 px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-1.5 text-gray-400 hover:bg-surface-2 hover:text-white transition-colors lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="text-base font-semibold text-white">{title}</h1>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  )
}
