import type { NoiseFn, Scenario, SignalValues } from './types.js'

/**
 * Thermal runaway: board temperature stable at 40°C for ticks 0-60,
 * then +0.5°C/tick to ~70°C by tick 120.
 * Control loop freq drops after tick 80 (thermal throttling).
 * Noise increases after temperature exceeds 55°C.
 */
export const thermalRunawayScenario: Scenario = {
  name: 'thermal_runaway',
  generate(tick: number, _totalTicks: number, noise: NoiseFn): SignalValues {
    // Temperature: stable 40°C for 0-60, then ramp +0.5°C/tick
    let baseTemp: number
    if (tick <= 60) {
      baseTemp = 40
    } else {
      baseTemp = 40 + (tick - 60) * 0.5
    }

    // Noise multiplier increases when temp > 55°C
    const noiseMul = baseTemp > 55 ? 1 + (baseTemp - 55) * 0.1 : 1

    // Control loop frequency drops after tick 80 (thermal throttling)
    let baseFreq = 49.5
    if (tick > 80) {
      baseFreq = 49.5 - (tick - 80) * 0.3
    }

    return {
      board_temperature_c: noise(baseTemp, 0.5 * noiseMul),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3 * noiseMul)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01 * noiseMul)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05 * noiseMul)),
      control_loop_freq_hz: noise(baseFreq, 0.5 * noiseMul),
      control_loop_error_count: tick > 80 ? Math.floor((tick - 80) * 0.5) : 0,
    }
  },
}
