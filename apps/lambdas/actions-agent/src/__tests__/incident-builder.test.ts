import type { DiagnosisEvent, IncidentRecord } from '@streaming-agents/core-contracts'
import { describe, expect, it } from 'vitest'
import { buildIncidentRecord } from '../incident-builder.js'

const NOW = '2025-01-01T01:00:00.000Z'
const NOW_EPOCH = Math.floor(new Date(NOW).getTime() / 1000)
const ACTION_EVENT_ID = 'act-1'

function makeDiagnosis(overrides?: Partial<DiagnosisEvent>): DiagnosisEvent {
  return {
    event_id: 'diag-1',
    trace_id: 'trace-abc',
    asset_id: 'robot-17',
    timestamp: '2025-01-01T00:59:30.000Z',
    risk_state: 'elevated',
    composite_risk: 0.65,
    root_cause: 'Joint bearing wear',
    evidence: [{ signal: 'joint_position_error_deg', observation: 'High error', z_score: 2.8 }],
    confidence: 'high',
    recommended_actions: ['reduce joint velocity'],
    severity: 'warning',
    model_id: 'anthropic.claude-sonnet-4-20250514',
    prompt_tokens: 500,
    completion_tokens: 200,
    ...overrides,
  }
}

function makeIncident(overrides?: Partial<IncidentRecord>): IncidentRecord {
  return {
    incident_id: 'inc-existing',
    asset_id: 'robot-17',
    status: 'opened',
    opened_at: '2025-01-01T00:00:00.000Z',
    escalated_at: null,
    resolved_at: null,
    root_cause: 'Joint bearing wear',
    severity: 'warning',
    last_diagnosis_event_id: 'diag-0',
    last_action_event_id: 'act-0',
    action_history: [{ action: 'alert', timestamp: '2025-01-01T00:00:00.000Z', event_id: 'act-0' }],
    updated_at: '2025-01-01T00:00:00.000Z',
    expires_at: null,
    ...overrides,
  }
}

describe('buildIncidentRecord', () => {
  describe('create (new incident)', () => {
    it('creates incident with new UUID and opened_at', () => {
      const record = buildIncidentRecord(makeDiagnosis(), 'alert', null, NOW, 72, ACTION_EVENT_ID)
      expect(record.incident_id).toBeTruthy()
      expect(record.incident_id).not.toBe('inc-existing')
      expect(record.opened_at).toBe(NOW)
      expect(record.asset_id).toBe('robot-17')
      expect(record.root_cause).toBe('Joint bearing wear')
    })

    it('creates opened incident for warning severity', () => {
      const record = buildIncidentRecord(makeDiagnosis(), 'alert', null, NOW, 72, ACTION_EVENT_ID)
      expect(record.status).toBe('opened')
      expect(record.escalated_at).toBeNull()
    })

    it('creates escalated incident for critical severity', () => {
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'critical' }),
        'shutdown_recommended',
        null,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.status).toBe('escalated')
      expect(record.escalated_at).toBe(NOW)
    })

    it('initializes action_history with first entry', () => {
      const record = buildIncidentRecord(makeDiagnosis(), 'alert', null, NOW, 72, ACTION_EVENT_ID)
      expect(record.action_history).toHaveLength(1)
      expect(record.action_history[0]).toEqual({
        action: 'alert',
        timestamp: NOW,
        event_id: ACTION_EVENT_ID,
      })
    })

    it('sets last_diagnosis_event_id and last_action_event_id', () => {
      const record = buildIncidentRecord(makeDiagnosis(), 'alert', null, NOW, 72, ACTION_EVENT_ID)
      expect(record.last_diagnosis_event_id).toBe('diag-1')
      expect(record.last_action_event_id).toBe(ACTION_EVENT_ID)
    })

    it('sets updated_at to now and expires_at to null', () => {
      const record = buildIncidentRecord(makeDiagnosis(), 'alert', null, NOW, 72, ACTION_EVENT_ID)
      expect(record.updated_at).toBe(NOW)
      expect(record.expires_at).toBeNull()
    })
  })

  describe('update (existing incident)', () => {
    it('preserves incident_id and opened_at', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis(),
        'monitor',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.incident_id).toBe('inc-existing')
      expect(record.opened_at).toBe('2025-01-01T00:00:00.000Z')
    })

    it('appends to action_history', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis(),
        'monitor',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.action_history).toHaveLength(2)
      expect(record.action_history[1]).toEqual({
        action: 'monitor',
        timestamp: NOW,
        event_id: ACTION_EVENT_ID,
      })
    })

    it('updates last_diagnosis_event_id', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis(),
        'monitor',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.last_diagnosis_event_id).toBe('diag-1')
    })

    it('escalates on throttle action', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis(),
        'throttle',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.status).toBe('escalated')
      expect(record.escalated_at).toBe(NOW)
    })

    it('escalates on shutdown_recommended action', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'critical' }),
        'shutdown_recommended',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.status).toBe('escalated')
    })

    it('preserves original escalated_at when already escalated', () => {
      const existing = makeIncident({
        status: 'escalated',
        escalated_at: '2025-01-01T00:30:00.000Z',
      })
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'critical' }),
        'shutdown_recommended',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.escalated_at).toBe('2025-01-01T00:30:00.000Z')
    })

    it('upgrades severity from warning to critical', () => {
      const existing = makeIncident({ severity: 'warning' })
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'critical' }),
        'shutdown_recommended',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.severity).toBe('critical')
    })

    it('does not downgrade severity from critical to warning', () => {
      const existing = makeIncident({ severity: 'critical' })
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'warning' }),
        'monitor',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.severity).toBe('critical')
    })
  })

  describe('resolve', () => {
    it('sets resolved_at to now', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'info' }),
        'resolve',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      expect(record.status).toBe('resolved')
      expect(record.resolved_at).toBe(NOW)
    })

    it('computes expires_at as epoch seconds + TTL hours', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'info' }),
        'resolve',
        existing,
        NOW,
        72,
        ACTION_EVENT_ID
      )
      const expectedTtl = NOW_EPOCH + 72 * 3600
      expect(record.expires_at).toBe(expectedTtl)
    })

    it('computes expires_at with different TTL hours', () => {
      const existing = makeIncident()
      const record = buildIncidentRecord(
        makeDiagnosis({ severity: 'info' }),
        'resolve',
        existing,
        NOW,
        24,
        ACTION_EVENT_ID
      )
      const expectedTtl = NOW_EPOCH + 24 * 3600
      expect(record.expires_at).toBe(expectedTtl)
    })
  })
})
