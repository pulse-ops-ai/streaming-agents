import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = {
  nominal: '#22c55e',
  elevated: '#f59e0b',
  critical: '#ef4444',
}

interface Props {
  nominal: number
  elevated: number
  critical: number
}

export function RiskDistributionChart({ nominal, elevated, critical }: Props) {
  const data = [
    { name: 'Nominal', value: nominal, color: COLORS.nominal },
    { name: 'Elevated', value: elevated, color: COLORS.elevated },
    { name: 'Critical', value: critical, color: COLORS.critical },
  ].filter((d) => d.value > 0)

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={65}
          dataKey="value"
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => [`${value} assets`, name]}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
