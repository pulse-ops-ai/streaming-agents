import { describe, expect, it } from 'vitest'
import {
  ActiveIncidentSummarySchema,
  AssetDetailResponseSchema,
  AssetHistoryPointSchema,
  AssetHistoryResponseSchema,
  ErrorResponseSchema,
  FleetAssetCardSchema,
  FleetOverviewResponseSchema,
  IncidentStatusSchema,
  IncidentsResponseSchema,
  RecentConversationItemSchema,
  RiskStateSchema,
  SeveritySchema,
  SignalValuesSchema,
  ZScoreBreakdownSchema,
} from '../index.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const signalValues = {
  board_temperature_c: 42.3,
  accel_magnitude_ms2: 1.2,
  gyro_magnitude_rads: 0.31,
  joint_position_error_deg: 0.08,
  control_loop_freq_hz: 100,
}

const zScores = {
  position_error_z: 1.2,
  accel_z: 0.4,
  gyro_z: 0.6,
  temperature_z: 2.1,
}

const historyPoint = {
  timestamp: '2026-03-10T12:00:00Z',
  composite_risk: 0.35,
  risk_state: 'nominal' as const,
  z_scores: zScores,
  last_values: signalValues,
  threshold_breach: 0,
  contributing_signals: [],
}

const incident = {
  incident_id: 'inc-001',
  asset_id: 'R-17',
  status: 'opened' as const,
  severity: 'warning' as const,
  root_cause: 'Elevated joint temperature',
  opened_at: '2026-03-10T11:55:00Z',
  escalated_at: null,
  acknowledged_at: null,
  resolved_at: null,
  duration: '5m 12s',
}

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

describe('common schemas', () => {
  it('parses valid RiskState values', () => {
    expect(RiskStateSchema.parse('nominal')).toBe('nominal')
    expect(RiskStateSchema.parse('elevated')).toBe('elevated')
    expect(RiskStateSchema.parse('critical')).toBe('critical')
  })

  it('rejects invalid RiskState', () => {
    expect(() => RiskStateSchema.parse('unknown')).toThrow()
  })

  it('parses valid Severity values', () => {
    expect(SeveritySchema.parse('info')).toBe('info')
    expect(SeveritySchema.parse('warning')).toBe('warning')
    expect(SeveritySchema.parse('critical')).toBe('critical')
  })

  it('rejects invalid Severity', () => {
    expect(() => SeveritySchema.parse('low')).toThrow()
  })

  it('parses valid IncidentStatus values', () => {
    expect(IncidentStatusSchema.parse('opened')).toBe('opened')
    expect(IncidentStatusSchema.parse('escalated')).toBe('escalated')
    expect(IncidentStatusSchema.parse('resolved')).toBe('resolved')
  })

  it('parses ErrorResponse', () => {
    const result = ErrorResponseSchema.parse({
      error: 'NotFound',
      message: 'Asset not found',
      status: 404,
    })
    expect(result.status).toBe(404)
  })

  it('rejects ErrorResponse with non-integer status', () => {
    expect(() => ErrorResponseSchema.parse({ error: 'Err', message: 'msg', status: 4.5 })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------

describe('fleet schemas', () => {
  it('parses SignalValues', () => {
    const result = SignalValuesSchema.parse(signalValues)
    expect(result.board_temperature_c).toBe(42.3)
  })

  it('rejects SignalValues with missing field', () => {
    const { control_loop_freq_hz: _, ...partial } = signalValues
    expect(() => SignalValuesSchema.parse(partial)).toThrow()
  })

  it('parses FleetAssetCard', () => {
    const card = FleetAssetCardSchema.parse({
      asset_id: 'R-17',
      risk_state: 'elevated',
      composite_risk: 0.65,
      last_values: signalValues,
      updated_at: '2026-03-10T12:00:00Z',
      has_active_incident: true,
    })
    expect(card.asset_id).toBe('R-17')
    expect(card.has_active_incident).toBe(true)
  })

  it('rejects FleetAssetCard with out-of-range composite_risk', () => {
    expect(() =>
      FleetAssetCardSchema.parse({
        asset_id: 'R-17',
        risk_state: 'nominal',
        composite_risk: 1.5,
        last_values: signalValues,
        updated_at: '2026-03-10T12:00:00Z',
        has_active_incident: false,
      })
    ).toThrow()
  })

  it('parses FleetOverviewResponse', () => {
    const response = FleetOverviewResponseSchema.parse({
      timestamp: '2026-03-10T12:00:00Z',
      total_assets: 3,
      risk_summary: { nominal: 1, elevated: 1, critical: 1 },
      active_incidents: 2,
      assets: [
        {
          asset_id: 'R-17',
          risk_state: 'critical',
          composite_risk: 0.92,
          last_values: signalValues,
          updated_at: '2026-03-10T12:00:00Z',
          has_active_incident: true,
        },
      ],
    })
    expect(response.total_assets).toBe(3)
    expect(response.assets).toHaveLength(1)
  })

  it('parses FleetOverviewResponse with empty assets', () => {
    const response = FleetOverviewResponseSchema.parse({
      timestamp: '2026-03-10T12:00:00Z',
      total_assets: 0,
      risk_summary: { nominal: 0, elevated: 0, critical: 0 },
      active_incidents: 0,
      assets: [],
    })
    expect(response.assets).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Asset History
// ---------------------------------------------------------------------------

describe('asset history schemas', () => {
  it('parses AssetHistoryPoint', () => {
    const point = AssetHistoryPointSchema.parse(historyPoint)
    expect(point.composite_risk).toBe(0.35)
    expect(point.contributing_signals).toEqual([])
  })

  it('parses AssetHistoryPoint with contributing signals', () => {
    const point = AssetHistoryPointSchema.parse({
      ...historyPoint,
      risk_state: 'elevated',
      composite_risk: 0.72,
      contributing_signals: ['board_temperature_c', 'joint_position_error_deg'],
    })
    expect(point.contributing_signals).toHaveLength(2)
  })

  it('parses AssetHistoryResponse', () => {
    const response = AssetHistoryResponseSchema.parse({
      asset_id: 'R-17',
      from: '2026-03-10T11:00:00Z',
      to: '2026-03-10T12:00:00Z',
      count: 1,
      points: [historyPoint],
    })
    expect(response.count).toBe(1)
    expect(response.points).toHaveLength(1)
  })

  it('rejects AssetHistoryResponse with negative count', () => {
    expect(() =>
      AssetHistoryResponseSchema.parse({
        asset_id: 'R-17',
        from: '2026-03-10T11:00:00Z',
        to: '2026-03-10T12:00:00Z',
        count: -1,
        points: [],
      })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

describe('incident schemas', () => {
  it('parses ActiveIncidentSummary with null timestamps', () => {
    const result = ActiveIncidentSummarySchema.parse(incident)
    expect(result.incident_id).toBe('inc-001')
    expect(result.escalated_at).toBeNull()
    expect(result.acknowledged_at).toBeNull()
    expect(result.resolved_at).toBeNull()
  })

  it('parses ActiveIncidentSummary with filled timestamps', () => {
    const resolved = ActiveIncidentSummarySchema.parse({
      ...incident,
      status: 'resolved',
      severity: 'critical',
      escalated_at: '2026-03-10T11:57:00Z',
      acknowledged_at: '2026-03-10T11:58:00Z',
      resolved_at: '2026-03-10T12:03:00Z',
      duration: '8m 00s',
    })
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolved_at).toBe('2026-03-10T12:03:00Z')
  })

  it('parses IncidentsResponse', () => {
    const response = IncidentsResponseSchema.parse({
      count: 1,
      incidents: [incident],
    })
    expect(response.count).toBe(1)
    expect(response.incidents[0].asset_id).toBe('R-17')
  })

  it('parses IncidentsResponse with empty list', () => {
    const response = IncidentsResponseSchema.parse({
      count: 0,
      incidents: [],
    })
    expect(response.incidents).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Asset Detail
// ---------------------------------------------------------------------------

describe('asset detail schemas', () => {
  it('parses ZScoreBreakdown', () => {
    const result = ZScoreBreakdownSchema.parse(zScores)
    expect(result.temperature_z).toBe(2.1)
  })

  it('parses AssetDetailResponse with no incident', () => {
    const response = AssetDetailResponseSchema.parse({
      asset_id: 'R-17',
      risk_state: 'nominal',
      composite_risk: 0.12,
      reading_count: 5000,
      updated_at: '2026-03-10T12:00:00Z',
      z_scores: zScores,
      threshold_breach: 0,
      contributing_signals: [],
      last_values: signalValues,
      recent_history: [historyPoint],
      active_incident: null,
    })
    expect(response.active_incident).toBeNull()
    expect(response.recent_history).toHaveLength(1)
  })

  it('parses AssetDetailResponse with active incident', () => {
    const response = AssetDetailResponseSchema.parse({
      asset_id: 'R-17',
      risk_state: 'elevated',
      composite_risk: 0.65,
      reading_count: 63000,
      updated_at: '2026-03-10T12:00:00Z',
      z_scores: zScores,
      threshold_breach: 0.3,
      contributing_signals: ['board_temperature_c'],
      last_values: signalValues,
      recent_history: [],
      active_incident: incident,
    })
    expect(response.active_incident?.incident_id).toBe('inc-001')
    expect(response.contributing_signals).toEqual(['board_temperature_c'])
  })

  it('rejects AssetDetailResponse with invalid risk_state', () => {
    expect(() =>
      AssetDetailResponseSchema.parse({
        asset_id: 'R-17',
        risk_state: 'unknown',
        composite_risk: 0.5,
        reading_count: 100,
        updated_at: '2026-03-10T12:00:00Z',
        z_scores: zScores,
        threshold_breach: 0,
        contributing_signals: [],
        last_values: signalValues,
        recent_history: [],
        active_incident: null,
      })
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

describe('conversation schemas', () => {
  it('parses RecentConversationItem', () => {
    const item = RecentConversationItemSchema.parse({
      timestamp: '2026-03-10T12:00:00Z',
      intent: 'AssetStatus',
      user_input: 'What is the status of R-17?',
      response_summary: 'R-17 is in elevated risk state with composite risk 0.65.',
    })
    expect(item.intent).toBe('AssetStatus')
  })

  it('rejects RecentConversationItem with missing fields', () => {
    expect(() =>
      RecentConversationItemSchema.parse({
        timestamp: '2026-03-10T12:00:00Z',
        intent: 'AssetStatus',
      })
    ).toThrow()
  })
})
