import type { AssetHistoryPoint } from '@streaming-agents/domain-models'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const RISK_COLORS = {
  nominal: '#22c55e',
  elevated: '#f59e0b',
  critical: '#ef4444',
}

function riskColor(value: number): string {
  if (value >= 0.7) return RISK_COLORS.critical
  if (value >= 0.4) return RISK_COLORS.elevated
  return RISK_COLORS.nominal
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function RiskChart({ points }: { points: AssetHistoryPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">
        No history data yet
      </div>
    )
  }

  const latest = points[points.length - 1].composite_risk

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={riskColor(latest)} stopOpacity={0.3} />
            <stop offset="100%" stopColor={riskColor(latest)} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatTime}
          stroke="#6b7280"
          tick={{ fontSize: 10 }}
          minTickGap={40}
        />
        <YAxis domain={[0, 1]} stroke="#6b7280" tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={formatTime}
          formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Risk']}
        />
        <ReferenceLine y={0.7} stroke={RISK_COLORS.critical} strokeDasharray="4 4" />
        <ReferenceLine y={0.4} stroke={RISK_COLORS.elevated} strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="composite_risk"
          stroke={riskColor(latest)}
          fill="url(#riskGradient)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
