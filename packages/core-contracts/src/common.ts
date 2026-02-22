/** Categorical risk state derived from composite risk score. */
export type RiskState = 'nominal' | 'elevated' | 'critical'

/** Origin category of a telemetry event. */
export type SourceType = 'edge' | 'simulated' | 'replay'

/** Per-signal z-score breakdown from the Signal Agent. */
export interface ZScores {
  position_error_z: number
  accel_z: number
  gyro_z: number
  temperature_z: number
}

/** Last raw signal values, carried through for diagnosis. */
export interface LastValues {
  board_temperature_c: number
  accel_magnitude_ms2: number
  gyro_magnitude_rads: number
  joint_position_error_deg: number
  control_loop_freq_hz: number
}

/** Simulator scenario names (locked). */
export type ScenarioName =
  | 'healthy'
  | 'joint_3_degradation'
  | 'thermal_runaway'
  | 'vibration_anomaly'
  | 'mixed'
