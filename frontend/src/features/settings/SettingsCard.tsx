interface Props {
  title: string
  description?: string
  children: React.ReactNode
}

export function SettingsCard({ title, description, children }: Props) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-gray-400">{description}</p>}
      </div>
      {children}
    </div>
  )
}
