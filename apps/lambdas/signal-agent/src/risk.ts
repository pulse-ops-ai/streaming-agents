import type { RiskState, ZScores } from '@streaming-agents/core-contracts'

/** Default minimum standard deviation to prevent division by zero. */
export const DEFAULT_MIN_STDDEV = 0.001

/** Default normalization divisor for composite risk. */
export const DEFAULT_NORMALIZE_DIVISOR = 3.0

/** LOCKED composite risk weights — DO NOT MODIFY. */
const WEIGHTS = {
  position_error: 0.35,
  accel: 0.25,
  gyro: 0.15,
  temperature: 0.15,
  threshold_breach: 0.1,
} as const

/** Absolute threshold values per signal. */
export const THRESHOLDS = {
  board_temperature_c: { warn: 50, critical: 60 },
  accel_magnitude_ms2: { warn: 12, critical: 15 },
  gyro_magnitude_rads: { warn: 0.1, critical: 0.2 },
  joint_position_error_deg: { warn: 1.0, critical: 2.5 },
} as const

/** Signal values used for threshold breach computation. */
export interface SignalValues {
  board_temperature_c: number | null
  accel_magnitude_ms2: number | null
  gyro_magnitude_rads: number | null
  joint_position_error_deg: number
}

/**
 * Compute z-score for a single signal value.
 * Returns 0.0 if the value is null (signal unavailable).
 *
 * Pure function — no I/O.
 */
export function computeZScore(
  value: number | null,
  mean: number,
  stdDev: number,
  minStdDev = DEFAULT_MIN_STDDEV
): number {
  if (value === null) return 0.0
  return (value - mean) / Math.max(stdDev, minStdDev)
}

/**
 * Compute the threshold breach score from raw signal values.
 * Returns 0.0 (none), 0.5 (warn), or 1.0 (critical).
 * Takes the max across all signals.
 *
 * Pure function — no I/O.
 */
export function computeThresholdBreach(signals: SignalValues): number {
  let maxBreach = 0.0

  for (const [signal, thresholds] of Object.entries(THRESHOLDS)) {
    const value = signals[signal as keyof typeof THRESHOLDS]
    if (value === null) continue

    if (value >= thresholds.critical) {
      maxBreach = Math.max(maxBreach, 1.0)
    } else if (value >= thresholds.warn) {
      maxBreach = Math.max(maxBreach, 0.5)
    }
  }

  return maxBreach
}

/**
 * Compute the LOCKED composite risk score.
 *
 * Formula:
 *   composite_risk =
 *     0.35 × abs(position_error_z) +
 *     0.25 × abs(accel_z) +
 *     0.15 × abs(gyro_z) +
 *     0.15 × abs(temperature_z) +
 *     0.10 × threshold_breach
 *
 * Normalized to [0, 1]: Math.min(composite_risk / divisor, 1.0)
 *
 * Pure function — no I/O. DO NOT MODIFY WEIGHTS.
 */
export function computeCompositeRisk(
  zScores: ZScores,
  thresholdBreach: number,
  normalizeDivisor = DEFAULT_NORMALIZE_DIVISOR
): number {
  const raw =
    WEIGHTS.position_error * Math.abs(zScores.position_error_z) +
    WEIGHTS.accel * Math.abs(zScores.accel_z) +
    WEIGHTS.gyro * Math.abs(zScores.gyro_z) +
    WEIGHTS.temperature * Math.abs(zScores.temperature_z) +
    WEIGHTS.threshold_breach * thresholdBreach

  return Math.min(raw / normalizeDivisor, 1.0)
}

/**
 * Compute threshold severity from absolute signal values.
 *
 * Unlike z-score-based risk (which detects transient spikes), this detects
 * sustained degradation by mapping signal values directly against thresholds:
 *   - below warn:    0.0  (nominal)
 *   - at warn:       0.50 (elevated boundary)
 *   - at critical:   0.75 (critical boundary)
 *   - above critical: 0.75–1.0 (proportional to excess)
 *
 * Returns the max severity across all signals.
 *
 * Pure function — no I/O.
 */
export function computeThresholdSeverity(signals: SignalValues): number {
  let maxSeverity = 0.0

  for (const [signal, thresholds] of Object.entries(THRESHOLDS)) {
    const value = signals[signal as keyof typeof THRESHOLDS]
    if (value === null) continue

    if (value >= thresholds.critical) {
      const excess = (value - thresholds.critical) / thresholds.critical
      maxSeverity = Math.max(maxSeverity, 0.75 + Math.min(excess, 1.0) * 0.25)
    } else if (value >= thresholds.warn) {
      const progress = (value - thresholds.warn) / (thresholds.critical - thresholds.warn)
      maxSeverity = Math.max(maxSeverity, 0.5 + progress * 0.25)
    }
  }

  return Math.min(maxSeverity, 1.0)
}

/**
 * Determine risk state from normalized composite risk score.
 * - nominal: < 0.50
 * - elevated: 0.50 ≤ risk < 0.75
 * - critical: ≥ 0.75
 *
 * Pure function — no I/O.
 */
export function determineRiskState(compositeRisk: number): RiskState {
  if (compositeRisk >= 0.75) return 'critical'
  if (compositeRisk >= 0.5) return 'elevated'
  return 'nominal'
}

/**
 * Identify contributing signals — those with |z| > 2.0.
 *
 * Pure function — no I/O.
 */
export function getContributingSignals(zScores: ZScores): string[] {
  const signals: string[] = []
  if (Math.abs(zScores.position_error_z) > 2.0) signals.push('joint_position_error_deg')
  if (Math.abs(zScores.accel_z) > 2.0) signals.push('accel_magnitude_ms2')
  if (Math.abs(zScores.gyro_z) > 2.0) signals.push('gyro_magnitude_rads')
  if (Math.abs(zScores.temperature_z) > 2.0) signals.push('board_temperature_c')
  return signals
}
