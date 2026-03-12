import type { LastValues, RiskState, ZScores } from './common.js'

/**
 * Signal Agent output: computed risk assessment for an asset.
 *
 * Stream: r17-risk-events
 * Producer: Signal Agent
 * Consumer: Diagnosis Agent (Phase 3)
 */
export interface RiskEvent {
  /** UUID v4 assigned by the Signal Agent. */
  event_id: string
  /** OTel trace ID propagated from the IngestedEvent. */
  trace_id: string
  /** Asset identifier. */
  asset_id: string
  /** ISO 8601 timestamp of the risk assessment. */
  timestamp: string
  /** Composite risk score (0.0 - 1.0). */
  composite_risk: number
  /** Categorical risk state. */
  risk_state: RiskState
  /** Per-signal z-score breakdown. */
  z_scores: ZScores
  /** Threshold breach component (0.0, 0.5, or 1.0). */
  threshold_breach: number
  /** Signal names with |z| > 2.0. */
  contributing_signals: string[]
  /** Last raw signal values for diagnosis context. */
  last_values: LastValues
}
