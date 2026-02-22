import type { NoiseFn, Scenario, SignalValues } from './types.js'

export const healthyScenario: Scenario = {
  name: 'healthy',
  generate(_tick: number, _totalTicks: number, noise: NoiseFn): SignalValues {
    return {
      board_temperature_c: noise(38, 2),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
      control_loop_freq_hz: noise(49.5, 0.5),
      control_loop_error_count: 0,
    }
  },
}
