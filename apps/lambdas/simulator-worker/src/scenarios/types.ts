export type { PRNG } from '../prng.js'
import type { PRNG } from '../prng.js'

/** Signal values produced by a scenario for a single tick. */
export interface SignalValues {
  board_temperature_c: number
  accel_magnitude_ms2: number
  gyro_magnitude_rads: number
  joint_position_error_deg: number
  control_loop_freq_hz: number
  control_loop_error_count: number
}

/** A noise function parameterized by mean and standard deviation. */
export type NoiseFn = (mean: number, std: number) => number

/** Scenario interface: generates signal values for each tick. */
export interface Scenario {
  name: string
  generate(tick: number, totalTicks: number, noise: NoiseFn, prng: PRNG): SignalValues
}
