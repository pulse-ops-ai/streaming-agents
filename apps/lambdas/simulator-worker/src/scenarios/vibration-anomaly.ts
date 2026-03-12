import type { NoiseFn, Scenario, SignalValues } from './types.js'

/**
 * Vibration anomaly: healthy baseline for first 90 ticks, then accelerometer
 * shows increasing mechanical looseness. Accel ramps to 13.5 m/s² (between
 * warn=12 and critical=15), gyro rises sympathetically.
 *
 * Target risk state: **elevated** (accel above warn but below critical).
 */
const ONSET_TICK = 90

export const vibrationAnomalyScenario: Scenario = {
  name: 'vibration_anomaly',
  generate(tick: number, totalTicks: number, noise: NoiseFn): SignalValues {
    // Phase 1: healthy baseline
    if (tick < ONSET_TICK) {
      return {
        board_temperature_c: noise(38, 2),
        accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
        gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
        joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
        control_loop_freq_hz: noise(49.5, 0.5),
        control_loop_error_count: 0,
      }
    }

    // Phase 2: vibration ramp
    const degradeTicks = totalTicks - ONSET_TICK
    const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
    const baseAccel = 9.81 + progress * 3.69 // → 13.5 m/s²
    const baseGyro = 0.02 + progress * 0.1 // → 0.12 rad/s (above warn=0.1)
    const baseError = 0.1 + progress * 0.4 // → 0.5° (below warn=1.0)

    return {
      board_temperature_c: noise(38, 2),
      accel_magnitude_ms2: Math.abs(noise(baseAccel, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(baseGyro, 0.01)),
      joint_position_error_deg: Math.abs(noise(baseError, 0.05)),
      control_loop_freq_hz: noise(49.5, 0.5),
      control_loop_error_count: 0,
    }
  },
}
