import { ErrorBanner } from '@/components/error-banner'
import { MetricCard } from '@/components/metric-card'
import { RiskBadge } from '@/components/risk-badge'
import { RiskChart } from '@/components/risk-chart'
import { Spinner } from '@/components/spinner'
import { useAssetDetail, useAssetHistory } from '@/hooks/use-asset'
import {
  Z_SCORE_LABELS,
  formatAccel,
  formatDeg,
  formatFreq,
  formatGyro,
  formatRisk,
  formatTemp,
  timeAgo,
} from '@/lib/format'
import { useUIStore } from '@/stores/ui'
import type { AssetDetailResponse } from '@streaming-agents/domain-models'
import { Link, useParams } from 'react-router-dom'

function zScoreLevel(val: number): 'critical' | 'elevated' | 'nominal' {
  const abs = Math.abs(val)
  if (abs > 3) return 'critical'
  if (abs > 2) return 'elevated'
  return 'nominal'
}

const Z_LEVEL_COLOR: Record<string, string> = {
  critical: 'text-critical',
  elevated: 'text-elevated',
  nominal: 'text-gray-200',
}

const Z_LEVEL_LABEL: Record<string, string> = {
  critical: 'breach',
  elevated: 'watch',
  nominal: 'normal',
}

/** Generate a one-line status summary for the asset header. */
function statusSummary(asset: AssetDetailResponse): string {
  if (asset.active_incident) {
    return `${asset.active_incident.root_cause} — ${asset.active_incident.severity} severity, ${asset.active_incident.duration}`
  }
  if (asset.risk_state === 'critical') {
    return `Risk at ${formatRisk(asset.composite_risk)} — ${asset.contributing_signals.length} signal${asset.contributing_signals.length === 1 ? '' : 's'} contributing`
  }
  if (asset.risk_state === 'elevated') {
    return `Elevated risk at ${formatRisk(asset.composite_risk)} — monitoring ${asset.contributing_signals.join(', ') || 'signals'}`
  }
  return 'Operating within normal parameters'
}

export function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const historyMinutes = useUIStore((s) => s.historyMinutes)
  const setHistoryMinutes = useUIStore((s) => s.setHistoryMinutes)

  // biome-ignore lint/style/noNonNullAssertion: assetId guaranteed by route param
  const detail = useAssetDetail(assetId!)
  // biome-ignore lint/style/noNonNullAssertion: assetId guaranteed by route param
  const history = useAssetHistory(assetId!, historyMinutes)

  if (detail.isLoading) return <Spinner />
  if (detail.error) return <ErrorBanner message={detail.error.message} />

  // biome-ignore lint/style/noNonNullAssertion: guarded by error check above
  const asset = detail.data!
  const isLive = asset.asset_id === 'R-17'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-gray-200">
            &larr; Fleet
          </Link>
          <h1 className="text-2xl font-bold">{asset.asset_id}</h1>
          <RiskBadge state={asset.risk_state} />
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-nominal">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-nominal animate-pulse" />
              Live
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-400">{statusSummary(asset)}</p>
        <p className="mt-0.5 text-[10px] text-gray-600">
          Last updated {timeAgo(asset.updated_at)} &middot; {asset.reading_count.toLocaleString()}{' '}
          readings
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Composite Risk"
          value={formatRisk(asset.composite_risk)}
          accent={asset.risk_state}
        />
        <MetricCard
          label="Board Temp"
          value={formatTemp(asset.last_values.board_temperature_c)}
          sub="temperature"
        />
        <MetricCard
          label="Position Error"
          value={formatDeg(asset.last_values.joint_position_error_deg)}
          sub="joint deviation"
        />
        <MetricCard
          label="Ctrl Frequency"
          value={formatFreq(asset.last_values.control_loop_freq_hz)}
          sub="control loop"
        />
      </div>

      {/* Signal detail row */}
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="Acceleration"
          value={formatAccel(asset.last_values.accel_magnitude_ms2)}
          sub="IMU accelerometer"
        />
        <MetricCard
          label="Gyroscope"
          value={formatGyro(asset.last_values.gyro_magnitude_rads)}
          sub="IMU gyro"
        />
      </div>

      {/* Risk chart */}
      <section className="rounded-lg border border-border bg-surface-alt p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Risk History
          </h2>
          <div className="flex gap-1">
            {[1, 5, 15, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setHistoryMinutes(m)}
                className={`rounded px-2 py-0.5 text-xs transition ${
                  historyMinutes === m
                    ? 'bg-gray-600 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
        <RiskChart points={history.data?.points ?? asset.recent_history} />
      </section>

      {/* Z-scores */}
      <section className="rounded-lg border border-border bg-surface-alt p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Signal Z-Scores
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(asset.z_scores).map(([key, val]) => {
            const level = zScoreLevel(val)
            return (
              <div key={key} className="rounded-lg bg-surface px-3 py-2">
                <dt className="text-xs text-gray-500">
                  {Z_SCORE_LABELS[key] ?? key.replace(/_z$/, '')}
                </dt>
                <dd
                  className={`mt-0.5 font-mono text-xl font-bold tabular-nums ${Z_LEVEL_COLOR[level]}`}
                >
                  {val.toFixed(2)}
                </dd>
                <dd className="mt-0.5 text-[10px] text-gray-600">{Z_LEVEL_LABEL[level]}</dd>
              </div>
            )
          })}
        </dl>
        {asset.contributing_signals.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Contributing signals: {asset.contributing_signals.join(', ')}
          </p>
        )}
      </section>

      {/* Active incident */}
      {asset.active_incident && (
        <section className="rounded-lg border border-critical/30 bg-critical/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-critical">
            Active Incident
          </h2>
          <p className="mt-2 text-sm">{asset.active_incident.root_cause}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <span className="text-gray-500">Severity</span>
              <p className="mt-0.5 font-medium capitalize text-critical">
                {asset.active_incident.severity}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Duration</span>
              <p className="mt-0.5 font-medium">{asset.active_incident.duration}</p>
            </div>
            <div>
              <span className="text-gray-500">Status</span>
              <p className="mt-0.5 font-medium capitalize">{asset.active_incident.status}</p>
            </div>
            {asset.active_incident.opened_at && (
              <div>
                <span className="text-gray-500">Opened</span>
                <p className="mt-0.5 font-medium">{timeAgo(asset.active_incident.opened_at)}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
