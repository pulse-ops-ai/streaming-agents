import { describe, expect, it } from 'vitest'
import type {
  ActionEvent,
  ActionHistoryEntry,
  ActionType,
  AssetState,
  BaselineStats,
  Confidence,
  DiagnosisEvent,
  DiagnosisEvidence,
  IncidentRecord,
  IncidentStatus,
  IngestedEvent,
  RiskEvent,
  RiskState,
  Severity,
} from '../index.js'

describe('core-contracts type exports', () => {
  it('exports IngestedEvent with required fields', () => {
    const event = {
      event_id: 'e1',
      trace_id: 't1',
      ingested_at: '2025-01-01T00:00:00Z',
      source_partition: 'robot-17',
      source_sequence: '000001',
      source_type: 'simulated' as const,
    } satisfies Omit<IngestedEvent, 'payload'>
    expect(event.source_partition).toBe('robot-17')
  })

  it('exports RiskEvent with required fields', () => {
    const event: RiskEvent = {
      event_id: 'e2',
      trace_id: 't1',
      asset_id: 'robot-17',
      timestamp: '2025-01-01T00:00:00Z',
      composite_risk: 0.75,
      risk_state: 'elevated',
      z_scores: { position_error_z: 2.5, accel_z: 0.1, gyro_z: 0.3, temperature_z: 1.0 },
      threshold_breach: 0.5,
      contributing_signals: ['joint_position_error_deg'],
      last_values: {
        board_temperature_c: 45.2,
        accel_magnitude_ms2: 1.5,
        gyro_magnitude_rads: 0.3,
        joint_position_error_deg: 0.1,
        control_loop_freq_hz: 100,
      },
    }
    expect(event.composite_risk).toBe(0.75)
  })

  it('exports DiagnosisEvent with required fields', () => {
    const evidence: DiagnosisEvidence = {
      signal: 'joint_position_error_deg',
      observation: 'Position error exceeds 2 standard deviations',
      z_score: 2.5,
    }
    const event: DiagnosisEvent = {
      event_id: 'e3',
      trace_id: 't1',
      asset_id: 'robot-17',
      timestamp: '2025-01-01T00:00:00Z',
      risk_state: 'elevated',
      composite_risk: 0.75,
      root_cause: 'Joint bearing wear',
      evidence: [evidence],
      confidence: 'high',
      recommended_actions: ['reduce joint velocity'],
      severity: 'warning',
      model_id: 'anthropic.claude-sonnet-4-20250514',
      prompt_tokens: 500,
      completion_tokens: 200,
    }
    expect(event.evidence).toHaveLength(1)
    expect(event.confidence).toBe('high')
  })

  it('exports ActionEvent with required fields', () => {
    const event: ActionEvent = {
      event_id: 'e4',
      trace_id: 't1',
      asset_id: 'robot-17',
      timestamp: '2025-01-01T00:00:00Z',
      action: 'alert',
      severity: 'warning',
      incident_id: 'inc-1',
      incident_status: 'opened',
      reason: 'New warning-level diagnosis with no open incident',
      diagnosis_event_id: 'e3',
    }
    expect(event.action).toBe('alert')
    expect(event.incident_id).toBe('inc-1')
  })

  it('exports ActionEvent with null incident fields', () => {
    const event: ActionEvent = {
      event_id: 'e5',
      trace_id: 't1',
      asset_id: 'robot-17',
      timestamp: '2025-01-01T00:00:00Z',
      action: 'monitor',
      severity: 'info',
      incident_id: null,
      incident_status: null,
      reason: 'Info-level diagnosis, monitoring only',
      diagnosis_event_id: 'e3',
    }
    expect(event.incident_id).toBeNull()
    expect(event.incident_status).toBeNull()
  })

  it('exports IncidentRecord with full lifecycle fields', () => {
    const entry: ActionHistoryEntry = {
      action: 'alert',
      timestamp: '2025-01-01T00:00:00Z',
      event_id: 'e4',
    }
    const record: IncidentRecord = {
      incident_id: 'inc-1',
      asset_id: 'robot-17',
      status: 'opened',
      opened_at: '2025-01-01T00:00:00Z',
      escalated_at: null,
      acknowledged_at: null,
      resolved_at: null,
      root_cause: 'Joint bearing wear',
      severity: 'warning',
      last_diagnosis_event_id: 'e3',
      last_action_event_id: 'e4',
      action_history: [entry],
      updated_at: '2025-01-01T00:00:00Z',
      expires_at: null,
    }
    expect(record.action_history).toHaveLength(1)
    expect(record.expires_at).toBeNull()
    expect(record.escalated_at).toBeNull()
  })

  it('exports IncidentRecord with resolved state and TTL', () => {
    const record: IncidentRecord = {
      incident_id: 'inc-2',
      asset_id: 'robot-17',
      status: 'resolved',
      opened_at: '2025-01-01T00:00:00Z',
      escalated_at: '2025-01-01T00:01:00Z',
      acknowledged_at: '2025-01-01T00:02:00Z',
      resolved_at: '2025-01-01T00:05:00Z',
      root_cause: 'Thermal runaway',
      severity: 'critical',
      last_diagnosis_event_id: 'e10',
      last_action_event_id: 'e11',
      action_history: [
        { action: 'alert', timestamp: '2025-01-01T00:00:00Z', event_id: 'e8' },
        { action: 'throttle', timestamp: '2025-01-01T00:01:00Z', event_id: 'e9' },
        { action: 'shutdown_recommended', timestamp: '2025-01-01T00:02:00Z', event_id: 'e10' },
        { action: 'resolve', timestamp: '2025-01-01T00:05:00Z', event_id: 'e11' },
      ],
      updated_at: '2025-01-01T00:05:00Z',
      expires_at: 1735776300,
    }
    expect(record.status).toBe('resolved')
    expect(record.expires_at).toBe(1735776300)
    expect(record.action_history).toHaveLength(4)
  })

  it('exports AssetState with last_diagnosis_at as string | null', () => {
    const state: AssetState = {
      asset_id: 'robot-17',
      updated_at: '2025-01-01T00:00:00Z',
      reading_count: 100,
      baselines: {
        temperature: { mean: 45.0, variance: 4.0, std_dev: 2.0 },
      },
      z_scores: { position_error_z: 0, accel_z: 0, gyro_z: 0, temperature_z: 0 },
      composite_risk: 0,
      risk_state: 'nominal',
      threshold_breach: 0,
      last_values: {
        board_temperature_c: 45.0,
        accel_magnitude_ms2: 1.0,
        gyro_magnitude_rads: 0.2,
        joint_position_error_deg: 0.05,
        control_loop_freq_hz: 100,
      },
      last_trace_id: 't1',
      last_event_id: 'e1',
      last_diagnosis_at: null,
    }
    expect(state.last_diagnosis_at).toBeNull()

    // Verify it accepts a string value too
    const stateWithDiagnosis: AssetState = { ...state, last_diagnosis_at: '2025-01-01T00:00:00Z' }
    expect(stateWithDiagnosis.last_diagnosis_at).toBe('2025-01-01T00:00:00Z')
  })

  it('exports all union types with correct literal values', () => {
    const riskStates: RiskState[] = ['nominal', 'elevated', 'critical']
    expect(riskStates).toHaveLength(3)

    const severities: Severity[] = ['info', 'warning', 'critical']
    expect(severities).toHaveLength(3)

    const confidences: Confidence[] = ['low', 'medium', 'high']
    expect(confidences).toHaveLength(3)

    const actions: ActionType[] = [
      'monitor',
      'alert',
      'throttle',
      'shutdown_recommended',
      'resolve',
    ]
    expect(actions).toHaveLength(5)

    const statuses: IncidentStatus[] = ['opened', 'escalated', 'resolved']
    expect(statuses).toHaveLength(3)
  })
})
