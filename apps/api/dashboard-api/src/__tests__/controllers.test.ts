import type { AssetState, IncidentRecord } from '@streaming-agents/core-contracts'
import {
  AssetHistoryResponseSchema,
  FleetOverviewResponseSchema,
  IncidentsResponseSchema,
} from '@streaming-agents/domain-models'
import { describe, expect, it, vi } from 'vitest'
import { AssetsController } from '../controllers/assets.controller.js'
import { FleetController } from '../controllers/fleet.controller.js'
import { IncidentsController } from '../controllers/incidents.controller.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const assetR17: AssetState = {
  asset_id: 'R-17',
  updated_at: '2026-03-10T12:00:00Z',
  reading_count: 63000,
  baselines: {},
  z_scores: { position_error_z: 2.5, accel_z: 0.1, gyro_z: 0.3, temperature_z: 0.8 },
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

const incident: IncidentRecord = {
  incident_id: 'inc-001',
  asset_id: 'R-17',
  status: 'opened',
  opened_at: '2026-03-10T11:55:00Z',
  escalated_at: null,
  acknowledged_at: null,
  resolved_at: null,
  root_cause: 'Joint position error',
  severity: 'warning',
  last_diagnosis_event_id: 'd1',
  last_action_event_id: 'a1',
  action_history: [],
  updated_at: '2026-03-10T11:55:00Z',
  expires_at: null,
}

// ---------------------------------------------------------------------------
// FleetController
// ---------------------------------------------------------------------------

describe('FleetController', () => {
  const mockAssetState = {
    scanAllAssets: vi.fn(),
    getAsset: vi.fn(),
  }
  const mockIncidents = {
    getAssetIdsWithActiveIncidents: vi.fn(),
    scanActiveIncidents: vi.fn(),
    findActiveIncidentForAsset: vi.fn(),
  }

  const controller = new FleetController(mockAssetState as never, mockIncidents as never)

  it('returns a valid FleetOverviewResponse', async () => {
    mockAssetState.scanAllAssets.mockResolvedValueOnce([assetR17])
    mockIncidents.getAssetIdsWithActiveIncidents.mockResolvedValueOnce(new Set(['R-17']))

    const result = await controller.getFleetOverview()
    expect(result.total_assets).toBe(1)
    expect(result.active_incidents).toBe(1)
    expect(result.assets[0].asset_id).toBe('R-17')

    FleetOverviewResponseSchema.parse(result)
  })

  it('returns empty fleet', async () => {
    mockAssetState.scanAllAssets.mockResolvedValueOnce([])
    mockIncidents.getAssetIdsWithActiveIncidents.mockResolvedValueOnce(new Set())

    const result = await controller.getFleetOverview()
    expect(result.total_assets).toBe(0)

    FleetOverviewResponseSchema.parse(result)
  })
})

// ---------------------------------------------------------------------------
// AssetsController
// ---------------------------------------------------------------------------

describe('AssetsController', () => {
  const mockAssetState = { getAsset: vi.fn(), scanAllAssets: vi.fn() }
  const mockIncidents = {
    findActiveIncidentForAsset: vi.fn(),
    scanActiveIncidents: vi.fn(),
    getAssetIdsWithActiveIncidents: vi.fn(),
  }
  const mockHistory = { queryRecent: vi.fn(), queryHistory: vi.fn() }

  const controller = new AssetsController(
    mockAssetState as never,
    mockIncidents as never,
    mockHistory as never
  )

  it('returns asset detail with incident and history', async () => {
    mockAssetState.getAsset.mockResolvedValueOnce(assetR17)
    mockIncidents.findActiveIncidentForAsset.mockResolvedValueOnce(incident)
    mockHistory.queryRecent.mockResolvedValueOnce([
      {
        asset_id: 'R-17',
        timestamp: '2026-03-10T12:00:00Z',
        composite_risk: 0.72,
        risk_state: 'elevated',
        z_scores: assetR17.z_scores,
        last_values: assetR17.last_values,
        threshold_breach: 0.5,
        contributing_signals: ['joint_position_error_deg'],
      },
    ])

    const result = await controller.getAssetDetail('R-17')
    expect(result.asset_id).toBe('R-17')
    expect(result.active_incident?.incident_id).toBe('inc-001')
    expect(result.recent_history).toHaveLength(1)
  })

  it('throws NotFoundException for unknown asset', async () => {
    mockAssetState.getAsset.mockResolvedValueOnce(null)
    mockIncidents.findActiveIncidentForAsset.mockResolvedValueOnce(null)
    mockHistory.queryRecent.mockResolvedValueOnce([])

    await expect(controller.getAssetDetail('R-999')).rejects.toThrow('not found')
  })

  it('returns history with clamped minutes parameter', async () => {
    mockHistory.queryHistory.mockResolvedValueOnce([])

    const result = await controller.getAssetHistory('R-17', '100')
    // Clamped to 60
    expect(result.count).toBe(0)
    expect(result.asset_id).toBe('R-17')

    AssetHistoryResponseSchema.parse(result)
  })

  it('defaults to 5 minutes when no param', async () => {
    mockHistory.queryHistory.mockResolvedValueOnce([])

    const result = await controller.getAssetHistory('R-17', undefined)
    const fromMs = new Date(result.from).getTime()
    const toMs = new Date(result.to).getTime()
    const diffMinutes = (toMs - fromMs) / 60_000
    expect(diffMinutes).toBeCloseTo(5, 0)

    AssetHistoryResponseSchema.parse(result)
  })
})

// ---------------------------------------------------------------------------
// IncidentsController
// ---------------------------------------------------------------------------

describe('IncidentsController', () => {
  const mockIncidents = {
    scanActiveIncidents: vi.fn(),
    findActiveIncidentForAsset: vi.fn(),
    getAssetIdsWithActiveIncidents: vi.fn(),
  }

  const controller = new IncidentsController(mockIncidents as never)

  it('returns active incidents sorted by opened_at desc', async () => {
    const older = { ...incident, incident_id: 'inc-old', opened_at: '2026-03-10T10:00:00Z' }
    const newer = { ...incident, incident_id: 'inc-new', opened_at: '2026-03-10T11:55:00Z' }
    mockIncidents.scanActiveIncidents.mockResolvedValueOnce([older, newer])

    const result = await controller.getActiveIncidents()
    expect(result.count).toBe(2)
    expect(result.incidents[0].incident_id).toBe('inc-new')
    expect(result.incidents[1].incident_id).toBe('inc-old')

    IncidentsResponseSchema.parse(result)
  })

  it('returns empty when no active incidents', async () => {
    mockIncidents.scanActiveIncidents.mockResolvedValueOnce([])

    const result = await controller.getActiveIncidents()
    expect(result.count).toBe(0)
    expect(result.incidents).toEqual([])

    IncidentsResponseSchema.parse(result)
  })
})
