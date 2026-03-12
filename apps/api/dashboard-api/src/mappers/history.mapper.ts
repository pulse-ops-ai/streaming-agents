import type { AssetHistoryPoint } from '@streaming-agents/domain-models'
import type { HistoryRow } from '../adapters/asset-history.adapter.js'

/** Map a raw history DynamoDB row to the API's AssetHistoryPoint shape. */
export function toAssetHistoryPoint(row: HistoryRow): AssetHistoryPoint {
  return {
    timestamp: row.timestamp,
    composite_risk: row.composite_risk ?? 0,
    risk_state: (row.risk_state as AssetHistoryPoint['risk_state']) ?? 'nominal',
    z_scores: {
      position_error_z: row.z_scores?.position_error_z ?? 0,
      accel_z: row.z_scores?.accel_z ?? 0,
      gyro_z: row.z_scores?.gyro_z ?? 0,
      temperature_z: row.z_scores?.temperature_z ?? 0,
    },
    last_values: {
      board_temperature_c: row.last_values?.board_temperature_c ?? 0,
      accel_magnitude_ms2: row.last_values?.accel_magnitude_ms2 ?? 0,
      gyro_magnitude_rads: row.last_values?.gyro_magnitude_rads ?? 0,
      joint_position_error_deg: row.last_values?.joint_position_error_deg ?? 0,
      control_loop_freq_hz: row.last_values?.control_loop_freq_hz ?? 0,
    },
    threshold_breach: row.threshold_breach ?? 0,
    contributing_signals: row.contributing_signals ?? [],
  }
}
