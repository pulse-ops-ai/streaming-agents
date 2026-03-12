import type { NoiseFn, Scenario, SignalValues } from './types.js'

/**
 * Thermal runaway: healthy baseline for first 90 ticks, then board temperature
 * ramps from 38°C → 55°C (between warn=50 and critical=60). Control loop
 * frequency drops slightly as thermal throttling sets in.
 *
 * Target risk state: **elevated** (temperature above warn but below critical).
 */
const ONSET_TICK = 90

export const thermalRunawayScenario: Scenario = {
  name: 'thermal_runaway',
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

    // Phase 2: thermal ramp
    const degradeTicks = totalTicks - ONSET_TICK
    const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
    const baseTemp = 38 + progress * 17 // → 55°C
    const baseFreq = Math.max(30, 49.5 - progress * 19.5) // → 30 Hz

    return {
      board_temperature_c: noise(baseTemp, 0.5),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
      control_loop_freq_hz: Math.max(1, noise(baseFreq, 0.5)),
      control_loop_error_count: progress > 0.5 ? Math.floor((progress - 0.5) * 10) : 0,
    }
  },
}
