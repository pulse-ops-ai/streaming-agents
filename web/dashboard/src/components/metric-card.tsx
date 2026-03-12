const accentStyles: Record<string, string> = {
  nominal: 'text-nominal',
  elevated: 'text-elevated',
  critical: 'text-critical',
}

export function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'nominal' | 'elevated' | 'critical'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? accentStyles[accent] : ''}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
