import type { ActionType, IncidentStatus, Severity } from './common.js'

/** A single entry in the incident's action history. */
export interface ActionHistoryEntry {
  /** Action that was taken. */
  action: ActionType
  /** ISO 8601 timestamp when the action occurred. */
  timestamp: string
  /** ActionEvent ID that triggered this entry. */
  event_id: string
}

/**
 * DynamoDB document shape for incident lifecycle tracking.
 *
 * Table: streaming-agents-incidents
 * PK: incident_id
 * GSI: asset_id-status-index (hash: asset_id, range: status)
 */
export interface IncidentRecord {
  /** Incident identifier (partition key, UUID v4). */
  incident_id: string
  /** Asset identifier (GSI hash key). */
  asset_id: string
  /** Current incident lifecycle state (GSI range key). */
  status: IncidentStatus
  /** ISO 8601 timestamp when the incident was opened. */
  opened_at: string
  /** ISO 8601 timestamp when the incident was escalated; null if not escalated. */
  escalated_at: string | null
  /** ISO 8601 timestamp when the incident was resolved; null if still active. */
  resolved_at: string | null
  /** Root cause from the initial DiagnosisEvent. */
  root_cause: string
  /** Current severity (may upgrade from warning to critical). */
  severity: Severity
  /** DiagnosisEvent ID that most recently updated this incident. */
  last_diagnosis_event_id: string
  /** ActionEvent ID that most recently updated this incident. */
  last_action_event_id: string
  /** Chronological log of actions taken on this incident. */
  action_history: ActionHistoryEntry[]
  /** ISO 8601 timestamp of the last update to this record. */
  updated_at: string
  /** TTL epoch seconds; set on resolution for automatic cleanup, null while active. */
  expires_at: number | null
}
