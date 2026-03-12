import type { RiskState } from '@streaming-agents/domain-models'

const styles: Record<RiskState, string> = {
  nominal: 'bg-nominal/20 text-nominal border-nominal/40',
  elevated: 'bg-elevated/20 text-elevated border-elevated/40',
  critical: 'bg-critical/20 text-critical border-critical/40',
}

export function RiskBadge({ state }: { state: RiskState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[state]}`}
    >
      {state}
    </span>
  )
}
