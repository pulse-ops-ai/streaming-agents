interface Props {
  nominal: number
  elevated: number
  critical: number
}

export function RiskSummaryBar({ nominal, elevated, critical }: Props) {
  const total = nominal + elevated + critical
  if (total === 0) return null

  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {nominal > 0 && (
          <div
            className="bg-nominal transition-all"
            style={{ width: pct(nominal) }}
            title={`${nominal} nominal`}
          />
        )}
        {elevated > 0 && (
          <div
            className="bg-elevated transition-all"
            style={{ width: pct(elevated) }}
            title={`${elevated} elevated`}
          />
        )}
        {critical > 0 && (
          <div
            className="bg-critical transition-all"
            style={{ width: pct(critical) }}
            title={`${critical} critical`}
          />
        )}
      </div>
      <div className="mt-1.5 flex gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-nominal" />
          Nominal {nominal}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-elevated" />
          Elevated {elevated}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-critical" />
          Critical {critical}
        </span>
      </div>
    </div>
  )
}
