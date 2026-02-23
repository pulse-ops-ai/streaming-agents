import { randomUUID } from 'node:crypto'
import type {
  ActionHistoryEntry,
  ActionType,
  DiagnosisEvent,
  IncidentRecord,
} from '@streaming-agents/core-contracts'

/**
 * Build or update an IncidentRecord based on the action rules output.
 *
 * Pure function — `now` and `actionEventId` are injected for testability.
 */
export function buildIncidentRecord(
  diagnosis: DiagnosisEvent,
  action: ActionType,
  existingIncident: IncidentRecord | null,
  now: string,
  resolvedTtlHours: number,
  actionEventId: string
): IncidentRecord {
  const historyEntry: ActionHistoryEntry = {
    action,
    timestamp: now,
    event_id: actionEventId,
  }

  // Create new incident
  if (!existingIncident) {
    return {
      incident_id: randomUUID(),
      asset_id: diagnosis.asset_id,
      status: diagnosis.severity === 'critical' ? 'escalated' : 'opened',
      opened_at: now,
      escalated_at: diagnosis.severity === 'critical' ? now : null,
      resolved_at: null,
      root_cause: diagnosis.root_cause,
      severity: diagnosis.severity,
      last_diagnosis_event_id: diagnosis.event_id,
      last_action_event_id: actionEventId,
      action_history: [historyEntry],
      updated_at: now,
      expires_at: null,
    }
  }

  // Update existing incident
  const updated: IncidentRecord = {
    ...existingIncident,
    severity: upgradeSeverity(existingIncident.severity, diagnosis.severity),
    last_diagnosis_event_id: diagnosis.event_id,
    last_action_event_id: actionEventId,
    action_history: [...existingIncident.action_history, historyEntry],
    updated_at: now,
  }

  // Handle escalation
  if (action === 'throttle' || action === 'shutdown_recommended') {
    updated.status = 'escalated'
    updated.escalated_at = existingIncident.escalated_at ?? now
  }

  // Handle resolution
  if (action === 'resolve') {
    updated.status = 'resolved'
    updated.resolved_at = now
    updated.expires_at = computeTtlEpoch(now, resolvedTtlHours)
  }

  return updated
}

/** Severity can only upgrade, never downgrade. */
function upgradeSeverity(
  current: 'info' | 'warning' | 'critical',
  incoming: 'info' | 'warning' | 'critical'
): 'info' | 'warning' | 'critical' {
  const order = { info: 0, warning: 1, critical: 2 }
  return order[incoming] > order[current] ? incoming : current
}

/** Compute DynamoDB TTL epoch seconds from now + hours. */
function computeTtlEpoch(now: string, hours: number): number {
  return Math.floor(new Date(now).getTime() / 1000) + hours * 3600
}
