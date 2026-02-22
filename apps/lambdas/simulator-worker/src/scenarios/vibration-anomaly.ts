import type { NoiseFn, Scenario, SignalValues } from './types.js'

/**
 * Vibration anomaly: accelerometer shows increasing mechanical looseness.
 * accel: 9.81 → 15.0, gyro: 0.02 → 0.15 (sympathetic),
 * position error: 0.1 → 0.8 (slight), temperature: normal.
 */
export const vibrationAnomalyScenario: Scenario = {
  name: 'vibration_anomaly',
  generate(tick: number, totalTicks: number, noise: NoiseFn): SignalValues {
    const progress = tick / (totalTicks - 1 || 1)

    // Accel: linear 9.81 → 15.0
    const baseAccel = 9.81 + progress * 5.19
    // Gyro: sympathetic 0.02 → 0.15
    const baseGyro = 0.02 + progress * 0.13
    // Position error: slight 0.1 → 0.8
    const baseError = 0.1 + progress * 0.7

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
