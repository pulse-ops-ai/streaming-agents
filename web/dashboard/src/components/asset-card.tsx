import { formatAccel, formatDeg, formatFreq, formatRisk, formatTemp, timeAgo } from '@/lib/format'
import type { FleetAssetCard } from '@streaming-agents/domain-models'
import { Link } from 'react-router-dom'
import { RiskBadge } from './risk-badge'

const riskColor: Record<string, string> = {
  nominal: 'text-nominal',
  elevated: 'text-elevated',
  critical: 'text-critical',
}

export function AssetCard({ asset }: { asset: FleetAssetCard }) {
  const isLive = asset.asset_id === 'R-17'

  return (
    <Link
      to={`/asset/${asset.asset_id}`}
      className="group block rounded-lg border border-border bg-surface-alt p-4 transition hover:border-gray-500"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold">{asset.asset_id}</h3>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-nominal">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-nominal animate-pulse" />
              Live
            </span>
          )}
        </div>
        <RiskBadge state={asset.risk_state} />
      </div>

      {/* Risk score */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${riskColor[asset.risk_state]}`}>
          {formatRisk(asset.composite_risk)}
        </span>
        <span className="text-xs text-gray-500">composite risk</span>
      </div>

      {/* Signal metrics */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-gray-500">Board Temp</dt>
        <dd className="text-right tabular-nums text-gray-300">
          {formatTemp(asset.last_values.board_temperature_c)}
        </dd>
        <dt className="text-gray-500">Pos Error</dt>
        <dd className="text-right tabular-nums text-gray-300">
          {formatDeg(asset.last_values.joint_position_error_deg)}
        </dd>
        <dt className="text-gray-500">Accel</dt>
        <dd className="text-right tabular-nums text-gray-300">
          {formatAccel(asset.last_values.accel_magnitude_ms2)}
        </dd>
        <dt className="text-gray-500">Ctrl Freq</dt>
        <dd className="text-right tabular-nums text-gray-300">
          {formatFreq(asset.last_values.control_loop_freq_hz)}
        </dd>
      </dl>

      {/* Footer: updated time + active incident */}
      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2">
        <span className="text-[10px] text-gray-600">{timeAgo(asset.updated_at)}</span>
        {asset.has_active_incident && (
          <span className="rounded bg-critical/10 px-1.5 py-0.5 text-[10px] font-medium text-critical">
            Active Incident
          </span>
        )}
      </div>
    </Link>
  )
}
