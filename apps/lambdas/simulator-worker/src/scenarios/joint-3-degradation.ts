import type { NoiseFn, Scenario, SignalValues } from './types.js'

/**
 * Joint 3 degradation: position error increases linearly 0.1° → 3.5° over 120 ticks.
 * Temperature rises sympathetically 38°C → 52°C.
 */
export const joint3DegradationScenario: Scenario = {
  name: 'joint_3_degradation',
  generate(tick: number, totalTicks: number, noise: NoiseFn): SignalValues {
    const progress = tick / (totalTicks - 1 || 1)

    // Position error: linear 0.1 → 3.5
    const baseError = 0.1 + progress * 3.4
    // Temperature: linear 38 → 52
    const baseTemp = 38 + progress * 14
    // Slight noise increase proportional to degradation
    const noiseMul = 1 + progress * 0.5

    return {
      board_temperature_c: noise(baseTemp, 1 * noiseMul),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3 * noiseMul)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01 * noiseMul)),
      joint_position_error_deg: Math.abs(noise(baseError, 0.05 * noiseMul)),
      control_loop_freq_hz: noise(49.5, 0.5),
      control_loop_error_count: Math.floor(progress * 5),
    }
  },
}
