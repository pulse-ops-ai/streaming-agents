import type { ActionType, IncidentStatus, Severity } from './common.js'

/**
 * Actions Agent output: deterministic response action for a diagnosis.
 *
 * Stream: r17-actions
 * Producer: Actions Agent
 * Consumer: Conversation Agent (Phase 4)
 */
export interface ActionEvent {
  /** UUID v4 assigned by the Actions Agent. */
  event_id: string
  /** OTel trace ID propagated from the DiagnosisEvent. */
  trace_id: string
  /** Asset identifier. */
  asset_id: string
  /** ISO 8601 timestamp of the action. */
  timestamp: string
  /** Action determined by the rules engine. */
  action: ActionType
  /** Severity of the triggering diagnosis. */
  severity: Severity
  /** Incident ID if an incident was created or updated; null for monitor-only. */
  incident_id: string | null
  /** Current incident status after this action; null if no incident involved. */
  incident_status: IncidentStatus | null
  /** Human-readable explanation of why this action was taken. */
  reason: string
  /** Reference to the triggering DiagnosisEvent. */
  diagnosis_event_id: string
}
