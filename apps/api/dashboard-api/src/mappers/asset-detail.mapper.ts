import type { IncidentRecord } from '@streaming-agents/core-contracts'
import type {
  AssetDetailResponse,
  AssetHistoryPoint,
  RiskState,
} from '@streaming-agents/domain-models'
import { toActiveIncidentSummary } from './incident.mapper.js'

/** Raw DynamoDB row — may be old-format (seed data) or current AssetState. */
type RawAssetRow = Record<string, unknown>

/** Derive contributing signals from z-scores (|z| > 2.0). */
function deriveContributingSignals(zScores: Record<string, number>): string[] {
  const signalMap: Record<string, string> = {
    position_error_z: 'joint_position_error_deg',
    accel_z: 'accel_magnitude_ms2',
    gyro_z: 'gyro_magnitude_rads',
    temperature_z: 'board_temperature_c',
  }
  const contributing: string[] = []
  for (const [key, signalName] of Object.entries(signalMap)) {
    if (Math.abs(zScores[key] ?? 0) > 2.0) {
      contributing.push(signalName)
    }
  }
  return contributing
}

/** Map a raw asset-state row + history + incident into an AssetDetailResponse. */
export function toAssetDetailResponse(
  state: RawAssetRow,
  recentHistory: AssetHistoryPoint[],
  activeIncident: IncidentRecord | null
): AssetDetailResponse {
  const rawZ = (state.z_scores ?? {}) as Record<string, number>
  const zScores = {
    position_error_z: Number(rawZ.position_error_z ?? 0),
    accel_z: Number(rawZ.accel_z ?? 0),
    gyro_z: Number(rawZ.gyro_z ?? 0),
    temperature_z: Number(rawZ.temperature_z ?? 0),
  }

  const lv = (state.last_values ?? {}) as Record<string, number>

  return {
    asset_id: state.asset_id as string,
    risk_state: ((state.risk_state as string) ?? 'nominal') as RiskState,
    composite_risk: Number(state.composite_risk ?? state.risk_score ?? 0),
    reading_count: Number(state.reading_count ?? 0),
    updated_at: (state.updated_at ?? state.last_updated ?? new Date().toISOString()) as string,
    z_scores: zScores,
    threshold_breach: Number(state.threshold_breach ?? 0),
    contributing_signals: deriveContributingSignals(zScores),
    last_values: {
      board_temperature_c: Number(lv.board_temperature_c ?? (state.ema_temperature as number) ?? 0),
      accel_magnitude_ms2: Number(lv.accel_magnitude_ms2 ?? 0),
      gyro_magnitude_rads: Number(lv.gyro_magnitude_rads ?? 0),
      joint_position_error_deg: Number(
        lv.joint_position_error_deg ?? (state.ema_position_error as number) ?? 0
      ),
      control_loop_freq_hz: Number(lv.control_loop_freq_hz ?? 0),
    },
    recent_history: recentHistory,
    active_incident: activeIncident ? toActiveIncidentSummary(activeIncident) : null,
  }
}
