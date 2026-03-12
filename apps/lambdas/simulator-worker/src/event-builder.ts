import type { SignalValues } from './scenarios/types.js'

let sequenceCounter = 0

export interface EventBuilderOpts {
  assetId: string
  baseTime: Date
  tick: number
}

/**
 * Builds a complete R17TelemetryV2Event from generated signal values.
 * Event shape matches the Zod schema in @streaming-agents/schemas.
 */
export function buildEvent(signals: SignalValues, opts: EventBuilderOpts): Record<string, unknown> {
  sequenceCounter++
  const timestamp = new Date(opts.baseTime.getTime() + opts.tick * 500)

  return {
    schema_version: 'r17.telemetry.v2',
    event_id: `sim-${opts.assetId}-${opts.tick}-${sequenceCounter}`,
    asset_id: opts.assetId,
    timestamp: timestamp.toISOString(),
    source: 'simulator',
    sequence: sequenceCounter,
    sampling_hz: 2,
    joint_position_error_deg: signals.joint_position_error_deg,
    board_temperature_c: signals.board_temperature_c,
    accel_magnitude_ms2: signals.accel_magnitude_ms2,
    gyro_magnitude_rads: signals.gyro_magnitude_rads,
    control_mode: 'stiff',
    control_loop_stats: {
      freq_hz: Math.max(0.1, signals.control_loop_freq_hz),
      max_interval_ms: Math.max(0.1, 1000 / Math.max(0.1, signals.control_loop_freq_hz)),
      error_count: signals.control_loop_error_count,
    },
    error_code: null,
  }
}

/** Reset the sequence counter (for testing). */
export function resetSequence(): void {
  sequenceCounter = 0
}
