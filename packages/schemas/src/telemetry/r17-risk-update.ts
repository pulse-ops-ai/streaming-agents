import { z } from 'zod'

/**
 * r17.risk_update.v1 — Risk update event emitted by the Signal Agent.
 *
 * Produced after evaluating a telemetry event against rolling baselines.
 * Contains the composite risk score, per-signal z-scores, and the fixed
 * weight vector used for the weighted sum.
 */

export const RiskStateEnum = z.enum(['nominal', 'elevated', 'critical'])

export type RiskState = z.infer<typeof RiskStateEnum>

/** Per-signal z-score breakdown. */
export const AnomalyZScoresSchema = z
  .object({
    joint_3_torque_nm: z.number(),
    joint_3_temperature_c: z.number(),
    motor_current_amp: z.number(),
    joint_position_error_deg: z.number(),
  })
  .strict()

export type AnomalyZScores = z.infer<typeof AnomalyZScoresSchema>

/** Fixed weight vector for the composite risk formula. */
export const RISK_WEIGHTS = {
  torque: 0.4,
  temperature: 0.3,
  position_error: 0.2,
  threshold_breach: 0.1,
} as const

export const RiskWeightsSchema = z
  .object({
    torque: z.literal(0.4),
    temperature: z.literal(0.3),
    position_error: z.literal(0.2),
    threshold_breach: z.literal(0.1),
  })
  .strict()

export type RiskWeights = z.infer<typeof RiskWeightsSchema>

export const R17RiskUpdateSchema = z
  .object({
    /** Fixed schema version identifier. */
    schema_version: z.literal('r17.risk_update.v1'),

    /** Unique event identifier (ULID or UUID). */
    event_id: z.string().min(1),

    /** Asset identifier. Locked to "r-17" for MVP. */
    asset_id: z.literal('r-17'),

    /** ISO 8601 UTC timestamp of this risk evaluation. */
    timestamp: z.string().datetime({ offset: true }),

    /** The telemetry event_id that triggered this evaluation. */
    telemetry_event_id: z.string().min(1),

    /** Rolling window size in seconds used for baseline calculation. */
    window_s: z.number().int().positive(),

    /** Composite risk score, clamped to [0, 1]. */
    risk_score: z.number().min(0).max(1),

    /** Categorical risk state derived from risk_score. */
    risk_state: RiskStateEnum,

    /** Per-signal z-score breakdown. */
    anomaly_z: AnomalyZScoresSchema,

    /** Fixed weight vector used in the composite formula. */
    weights: RiskWeightsSchema,
  })
  .strict()

export type R17RiskUpdate = z.infer<typeof R17RiskUpdateSchema>
