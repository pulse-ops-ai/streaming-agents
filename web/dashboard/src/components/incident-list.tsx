import { timeAgo } from '@/lib/format'
import type { ActiveIncidentSummary } from '@streaming-agents/domain-models'
import { Link } from 'react-router-dom'
import { RiskBadge } from './risk-badge'

export function IncidentList({ incidents }: { incidents: ActiveIncidentSummary[] }) {
  if (incidents.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">No active incidents</p>
  }

  return (
    <ul className="divide-y divide-border">
      {incidents.map((inc) => (
        <li key={inc.incident_id} className="py-3">
          <Link
            to={`/asset/${inc.asset_id}`}
            className="flex items-start gap-3 transition hover:opacity-80"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{inc.asset_id}</span>
                <RiskBadge state={inc.severity === 'critical' ? 'critical' : 'elevated'} />
              </div>
              <p className="mt-0.5 truncate text-sm text-gray-400">{inc.root_cause}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-gray-500">
              <div>{inc.duration}</div>
              <div className="capitalize">{inc.status}</div>
              {inc.opened_at && (
                <div className="mt-0.5 text-gray-600">{timeAgo(inc.opened_at)}</div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
