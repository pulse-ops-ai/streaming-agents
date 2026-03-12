import type { LastValues, RiskState, ZScores } from './common.js'

/** Per-signal rolling baseline statistics. */
export interface BaselineStats {
  mean: number
  variance: number
  std_dev: number
}

/**
 * DynamoDB document shape for per-asset rolling baselines and risk state.
 *
 * Table: r17-asset-state
 * PK: asset_id
 */
export interface AssetState {
  /** Asset identifier (partition key). */
  asset_id: string
  /** ISO 8601 timestamp of last update. */
  updated_at: string
  /** Total readings processed for this asset. */
  reading_count: number
  /** Rolling baselines per signal name. */
  baselines: Record<string, BaselineStats>
  /** Current z-scores. */
  z_scores: ZScores
  /** Current composite risk score (0.0 - 1.0). */
  composite_risk: number
  /** Current categorical risk state. */
  risk_state: RiskState
  /** Current threshold breach component. */
  threshold_breach: number
  /** Last raw signal values for diagnosis context. */
  last_values: LastValues
  /** OTel trace ID from the most recent event. */
  last_trace_id: string
  /** Event ID from the most recent event. */
  last_event_id: string
  /** ISO 8601 timestamp of the last Bedrock diagnosis call (debounce, set by Diagnosis Agent). */
  last_diagnosis_at: string | null
}
