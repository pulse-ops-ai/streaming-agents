import type { AssetState, IncidentRecord } from '@streaming-agents/core-contracts'
import {
  AssetDetailResponseSchema,
  FleetAssetCardSchema,
  FleetOverviewResponseSchema,
} from '@streaming-agents/domain-models'
import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../adapters/asset-history.adapter.js'
import { toAssetDetailResponse } from '../mappers/asset-detail.mapper.js'
import { toFleetAssetCard, toFleetOverviewResponse } from '../mappers/fleet.mapper.js'
import { toAssetHistoryPoint } from '../mappers/history.mapper.js'
import { formatDuration, toActiveIncidentSummary } from '../mappers/incident.mapper.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseAssetState: AssetState = {
  asset_id: 'R-17',
  updated_at: '2026-03-10T12:00:00Z',
  reading_count: 63000,
  baselines: { temperature: { mean: 45, variance: 4, std_dev: 2 } },
  z_scores: { position_error_z: 2.5, accel_z: 0.4, gyro_z: 0.6, temperature_z: 0.8 },
  composite_risk: 0.72,
  risk_state: 'elevated',
  threshold_breach: 0.5,
  last_values: {
    board_temperature_c: 47.3,
    accel_magnitude_ms2: 1.2,
    gyro_magnitude_rads: 0.31,
    joint_position_error_deg: 0.15,
    control_loop_freq_hz: 100,
  },
  last_trace_id: 't1',
  last_event_id: 'e1',
  last_diagnosis_at: null,
}

const nominalAsset: AssetState = {
  ...baseAssetState,
  asset_id: 'R-50',
  composite_risk: 0.08,
  risk_state: 'nominal',
  z_scores: { position_error_z: 0.1, accel_z: 0.2, gyro_z: 0.1, temperature_z: 0.3 },
  threshold_breach: 0,
}

const baseIncident: IncidentRecord = {
  incident_id: 'inc-001',
  asset_id: 'R-17',
  status: 'opened',
  opened_at: '2026-03-10T11:55:00Z',
  escalated_at: null,
  acknowledged_at: null,
  resolved_at: null,
  root_cause: 'Elevated joint position error',
  severity: 'warning',
  last_diagnosis_event_id: 'd1',
  last_action_event_id: 'a1',
  action_history: [{ action: 'alert', timestamp: '2026-03-10T11:55:00Z', event_id: 'a1' }],
  updated_at: '2026-03-10T11:55:00Z',
  expires_at: null,
}

const historyRow: HistoryRow = {
  asset_id: 'R-17',
  timestamp: '2026-03-10T12:00:00Z',
  composite_risk: 0.35,
  risk_state: 'nominal',
  z_scores: { position_error_z: 1.2, accel_z: 0.4, gyro_z: 0.6, temperature_z: 0.8 },
  last_values: {
    board_temperature_c: 42.3,
    accel_magnitude_ms2: 1.1,
    gyro_magnitude_rads: 0.29,
    joint_position_error_deg: 0.08,
    control_loop_freq_hz: 100,
  },
  threshold_breach: 0,
  contributing_signals: [],
}

// ---------------------------------------------------------------------------
// Fleet mapper
// ---------------------------------------------------------------------------

describe('fleet mapper', () => {
  it('maps AssetState to FleetAssetCard and passes Zod validation', () => {
    const card = toFleetAssetCard(baseAssetState, true)
    expect(card.asset_id).toBe('R-17')
    expect(card.has_active_incident).toBe(true)
    expect(card.composite_risk).toBe(0.72)

    // Zod parse should not throw
    FleetAssetCardSchema.parse(card)
  })

  it('builds FleetOverviewResponse sorted by composite_risk desc', () => {
    const incidentIds = new Set(['R-17'])
    const response = toFleetOverviewResponse([nominalAsset, baseAssetState], incidentIds)

    expect(response.total_assets).toBe(2)
    expect(response.risk_summary).toEqual({ nominal: 1, elevated: 1, critical: 0 })
    expect(response.active_incidents).toBe(1)
    // R-17 (0.72) should sort before R-50 (0.08)
    expect(response.assets[0].asset_id).toBe('R-17')
    expect(response.assets[1].asset_id).toBe('R-50')

    FleetOverviewResponseSchema.parse(response)
  })

  it('handles empty asset list', () => {
    const response = toFleetOverviewResponse([], new Set())
    expect(response.total_assets).toBe(0)
    expect(response.assets).toEqual([])

    FleetOverviewResponseSchema.parse(response)
  })

  it('defaults missing last_values fields to 0', () => {
    const sparse = { ...baseAssetState, last_values: {} } as unknown as AssetState
    const card = toFleetAssetCard(sparse, false)
    expect(card.last_values.board_temperature_c).toBe(0)
    expect(card.last_values.control_loop_freq_hz).toBe(0)

    FleetAssetCardSchema.parse(card)
  })
})

// ---------------------------------------------------------------------------
// Incident mapper
// ---------------------------------------------------------------------------

describe('incident mapper', () => {
  it('maps IncidentRecord to ActiveIncidentSummary', () => {
    const summary = toActiveIncidentSummary(baseIncident)
    expect(summary.incident_id).toBe('inc-001')
    expect(summary.severity).toBe('warning')
    expect(summary.escalated_at).toBeNull()
    expect(summary.duration).toMatch(/^\d+[hms]/)
  })

  it('formats duration correctly', () => {
    const now = new Date()
    expect(formatDuration(new Date(now.getTime() - 5000).toISOString())).toBe('5s')
    expect(formatDuration(new Date(now.getTime() - 125_000).toISOString())).toBe('2m 5s')
    expect(formatDuration(new Date(now.getTime() - 3_665_000).toISOString())).toBe('1h 1m')
  })

  it('handles future timestamps gracefully', () => {
    const futureTs = new Date(Date.now() + 60_000).toISOString()
    expect(formatDuration(futureTs)).toBe('0s')
  })
})

// ---------------------------------------------------------------------------
// History mapper
// ---------------------------------------------------------------------------

describe('history mapper', () => {
  it('maps HistoryRow to AssetHistoryPoint', () => {
    const point = toAssetHistoryPoint(historyRow)
    expect(point.composite_risk).toBe(0.35)
    expect(point.risk_state).toBe('nominal')
    expect(point.z_scores.position_error_z).toBe(1.2)
    expect(point.last_values.board_temperature_c).toBe(42.3)
  })

  it('defaults missing fields in sparse history rows', () => {
    const sparse: HistoryRow = {
      asset_id: 'R-8',
      timestamp: '2026-03-10T12:00:00Z',
      composite_risk: 0,
      risk_state: 'nominal',
      z_scores: {},
      last_values: {},
      threshold_breach: 0,
    }
    const point = toAssetHistoryPoint(sparse)
    expect(point.z_scores.accel_z).toBe(0)
    expect(point.last_values.gyro_magnitude_rads).toBe(0)
    expect(point.contributing_signals).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Asset detail mapper
// ---------------------------------------------------------------------------

describe('asset detail mapper', () => {
  it('maps AssetState with incident and history to AssetDetailResponse', () => {
    const historyPoints = [toAssetHistoryPoint(historyRow)]
    const response = toAssetDetailResponse(baseAssetState, historyPoints, baseIncident)

    expect(response.asset_id).toBe('R-17')
    expect(response.composite_risk).toBe(0.72)
    expect(response.recent_history).toHaveLength(1)
    expect(response.active_incident?.incident_id).toBe('inc-001')
    // position_error_z = 2.5 > 2.0, so contributing
    expect(response.contributing_signals).toContain('joint_position_error_deg')
    // accel_z = 0.4 < 2.0, so not contributing
    expect(response.contributing_signals).not.toContain('accel_magnitude_ms2')

    AssetDetailResponseSchema.parse(response)
  })

  it('maps AssetState without incident', () => {
    const response = toAssetDetailResponse(nominalAsset, [], null)
    expect(response.active_incident).toBeNull()
    expect(response.contributing_signals).toEqual([])
    expect(response.recent_history).toEqual([])

    AssetDetailResponseSchema.parse(response)
  })
})
