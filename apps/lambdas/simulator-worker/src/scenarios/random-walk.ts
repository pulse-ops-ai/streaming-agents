import type { NoiseFn, PRNG, Scenario, SignalValues } from './types.js'

/**
 * Random walk: Gaussian drift on all signals.
 * Each signal drifts from its baseline by a cumulative random offset.
 */
export const randomWalkScenario: Scenario = {
  name: 'random_walk',
  generate(tick: number, _totalTicks: number, noise: NoiseFn, prng: PRNG): SignalValues {
    // Cumulative drift grows with sqrt(tick) for Brownian-like behavior
    const driftScale = Math.sqrt(tick + 1)

    // Small random step per signal direction
    const tempDrift = (prng() - 0.5) * 2 * driftScale
    const accelDrift = (prng() - 0.5) * 0.5 * driftScale
    const gyroDrift = (prng() - 0.5) * 0.02 * driftScale

    return {
      board_temperature_c: noise(38 + tempDrift, 2),
      accel_magnitude_ms2: Math.abs(noise(9.81 + accelDrift, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(0.02 + Math.abs(gyroDrift), 0.01)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05 + tick * 0.002)),
      control_loop_freq_hz: noise(49.5, 0.5 + tick * 0.01),
      control_loop_error_count: 0,
    }
  },
}
