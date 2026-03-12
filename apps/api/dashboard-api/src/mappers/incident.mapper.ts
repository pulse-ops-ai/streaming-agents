import type { IncidentRecord } from '@streaming-agents/core-contracts'
import type { ActiveIncidentSummary } from '@streaming-agents/domain-models'

/** Compute a human-readable duration string from an ISO timestamp to now. */
export function formatDuration(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime()
  if (ms < 0) return '0s'

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/** Map an IncidentRecord (DynamoDB) to an ActiveIncidentSummary (API). */
export function toActiveIncidentSummary(record: IncidentRecord): ActiveIncidentSummary {
  return {
    incident_id: record.incident_id,
    asset_id: record.asset_id,
    status: record.status,
    severity: record.severity,
    root_cause: record.root_cause,
    opened_at: record.opened_at,
    escalated_at: record.escalated_at,
    acknowledged_at: record.acknowledged_at,
    resolved_at: record.resolved_at,
    duration: formatDuration(record.opened_at),
  }
}
