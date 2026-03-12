import type {
  FleetAssetCard,
  FleetOverviewResponse,
  RiskState,
} from '@streaming-agents/domain-models'

/** Raw DynamoDB row — may be old-format (seed data) or current AssetState. */
type RawAssetRow = Record<string, unknown>

/** Map a DynamoDB asset-state row to a FleetAssetCard, handling legacy field names. */
export function toFleetAssetCard(state: RawAssetRow, hasActiveIncident: boolean): FleetAssetCard {
  const lv = (state.last_values ?? {}) as Record<string, number>
  return {
    asset_id: state.asset_id as string,
    risk_state: ((state.risk_state as string) ?? 'nominal') as RiskState,
    composite_risk: Number(state.composite_risk ?? state.risk_score ?? 0),
    last_values: {
      board_temperature_c: Number(
        lv.board_temperature_c ?? (state as RawAssetRow).ema_temperature ?? 0
      ),
      accel_magnitude_ms2: Number(lv.accel_magnitude_ms2 ?? 0),
      gyro_magnitude_rads: Number(lv.gyro_magnitude_rads ?? 0),
      joint_position_error_deg: Number(
        lv.joint_position_error_deg ?? (state as RawAssetRow).ema_position_error ?? 0
      ),
      control_loop_freq_hz: Number(lv.control_loop_freq_hz ?? 0),
    },
    updated_at: (state.updated_at ?? state.last_updated ?? new Date().toISOString()) as string,
    has_active_incident: hasActiveIncident,
  }
}

/** Build the full fleet overview response from asset states + incident info. */
export function toFleetOverviewResponse(
  assets: RawAssetRow[],
  incidentAssetIds: Set<string>
): FleetOverviewResponse {
  const cards = assets
    .map((a) => toFleetAssetCard(a, incidentAssetIds.has(a.asset_id as string)))
    .sort((a, b) => b.composite_risk - a.composite_risk)

  const risk_summary = { nominal: 0, elevated: 0, critical: 0 }
  for (const card of cards) {
    risk_summary[card.risk_state]++
  }

  return {
    timestamp: new Date().toISOString(),
    total_assets: cards.length,
    risk_summary,
    active_incidents: incidentAssetIds.size,
    assets: cards,
  }
}
