import type { BaselineStats } from '@streaming-agents/core-contracts'

/**
 * Update rolling baselines using exponential moving average (EMA).
 *
 * Window: configurable (default 60 readings = 30s at 2 Hz)
 * Alpha: 2 / (window + 1)
 *
 * Pure function — no I/O, no side effects.
 */
export function updateBaselines(
  current: BaselineStats,
  newValue: number,
  alpha: number
): BaselineStats {
  const mean = alpha * newValue + (1 - alpha) * current.mean
  const variance = alpha * (newValue - mean) ** 2 + (1 - alpha) * current.variance
  const std_dev = Math.sqrt(variance)
  return { mean, variance, std_dev }
}

/**
 * Initialize baselines from a first reading.
 * Mean = value, variance = 0, std_dev = 0.
 */
export function initBaselines(value: number): BaselineStats {
  return { mean: value, variance: 0, std_dev: 0 }
}

/** Compute EMA alpha from window size. */
export function computeAlpha(window: number): number {
  return 2 / (window + 1)
}
