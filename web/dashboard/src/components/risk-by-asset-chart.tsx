import type { FleetAssetCard } from '@streaming-agents/domain-models'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const COLORS = {
  nominal: '#22c55e',
  elevated: '#f59e0b',
  critical: '#ef4444',
}

function barColor(risk: number): string {
  if (risk >= 0.7) return COLORS.critical
  if (risk >= 0.4) return COLORS.elevated
  return COLORS.nominal
}

export function RiskByAssetChart({ assets }: { assets: FleetAssetCard[] }) {
  if (assets.length === 0) return null

  const data = assets.map((a) => ({
    asset_id: a.asset_id,
    composite_risk: a.composite_risk,
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis dataKey="asset_id" stroke="#6b7280" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 1]} stroke="#6b7280" tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Risk']}
        />
        <ReferenceLine y={0.7} stroke={COLORS.critical} strokeDasharray="4 4" />
        <ReferenceLine y={0.4} stroke={COLORS.elevated} strokeDasharray="4 4" />
        <Bar dataKey="composite_risk" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.asset_id} fill={barColor(entry.composite_risk)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
