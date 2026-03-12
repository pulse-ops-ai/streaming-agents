import type { NoiseFn, Scenario, SignalValues } from './types.js'

/**
 * Joint 3 degradation: healthy baseline for first 90 ticks, then position
 * error ramps from 0.1° → 3.5° and temperature rises from 38°C → 52°C.
 *
 * Target risk state: **critical** (position error exceeds critical threshold of 2.5°).
 */
const ONSET_TICK = 90

export const joint3DegradationScenario: Scenario = {
  name: 'joint_3_degradation',
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

    // Phase 2: degradation ramp
    const degradeTicks = totalTicks - ONSET_TICK
    const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
    const baseError = 0.1 + progress * 3.4 // → 3.5°
    const baseTemp = 38 + progress * 14 // → 52°C
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
