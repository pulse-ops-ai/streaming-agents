import type { Confidence, RiskState, Severity } from './common.js'

/** A single piece of signal-level evidence from the LLM diagnosis. */
export interface DiagnosisEvidence {
  /** Signal name (e.g., "joint_position_error_deg"). */
  signal: string
  /** Human-readable observation of what this signal shows. */
  observation: string
  /** Z-score value for this signal. */
  z_score: number
}

/**
 * Diagnosis Agent output: LLM-generated explanation of a risk event.
 *
 * Stream: r17-diagnosis
 * Producer: Diagnosis Agent
 * Consumer: Actions Agent
 */
export interface DiagnosisEvent {
  /** UUID v4 assigned by the Diagnosis Agent. */
  event_id: string
  /** OTel trace ID propagated from the RiskEvent. */
  trace_id: string
  /** Asset identifier. */
  asset_id: string
  /** ISO 8601 timestamp of the diagnosis. */
  timestamp: string
  /** Risk state from the triggering RiskEvent. */
  risk_state: RiskState
  /** Composite risk score from the triggering RiskEvent (0.0 - 1.0). */
  composite_risk: number
  /** Concise explanation of the likely failure mode from Bedrock. */
  root_cause: string
  /** Signal-level evidence supporting the diagnosis. */
  evidence: DiagnosisEvidence[]
  /** LLM confidence in the diagnosis. */
  confidence: Confidence
  /** Suggested actions from the LLM (e.g., "reduce joint velocity"). */
  recommended_actions: string[]
  /** Severity classification. */
  severity: Severity
  /** Bedrock model identifier used for this diagnosis. */
  model_id: string
  /** Prompt token count for cost tracking. */
  prompt_tokens: number
  /** Completion token count for cost tracking. */
  completion_tokens: number
}
