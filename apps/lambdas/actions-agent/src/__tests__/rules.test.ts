import type { DiagnosisEvent, IncidentRecord } from '@streaming-agents/core-contracts'
import { describe, expect, it } from 'vitest'
import { type ActionRuleInput, evaluateActionRules } from '../rules.js'

const NOW = '2025-01-01T00:01:00.000Z'
const NOW_MS = new Date(NOW).getTime()

function makeDiagnosis(overrides?: Partial<DiagnosisEvent>): DiagnosisEvent {
  return {
    event_id: 'diag-1',
    trace_id: 'trace-abc',
    asset_id: 'robot-17',
    timestamp: '2025-01-01T00:00:30.000Z',
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
    incident_id: 'inc-1',
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

function makeInput(overrides?: Partial<ActionRuleInput>): ActionRuleInput {
  return {
    diagnosis: makeDiagnosis(),
    existingIncident: null,
    now: NOW,
    escalationThresholdMs: 60000,
    ...overrides,
  }
}

describe('evaluateActionRules', () => {
  // Rule 1: critical + no incident
  it('Rule 1: critical + no incident → shutdown_recommended, create escalated', () => {
    const result = evaluateActionRules(
      makeInput({ diagnosis: makeDiagnosis({ severity: 'critical' }), existingIncident: null })
    )
    expect(result.action).toBe('shutdown_recommended')
    expect(result.incident.operation).toBe('create')
    expect(result.incident.record?.status).toBe('escalated')
    expect(result.incident.record?.escalated_at).toBe(NOW)
    expect(result.reason).toContain('Critical risk detected')
  })

  // Rule 2: critical + existing opened
  it('Rule 2: critical + existing opened → shutdown_recommended, escalate', () => {
    const result = evaluateActionRules(
      makeInput({
        diagnosis: makeDiagnosis({ severity: 'critical' }),
        existingIncident: makeIncident({ status: 'opened' }),
      })
    )
    expect(result.action).toBe('shutdown_recommended')
    expect(result.incident.operation).toBe('update')
    expect(result.incident.record?.status).toBe('escalated')
    expect(result.incident.record?.escalated_at).toBe(NOW) // wasn't set before
    expect(result.reason).toContain('shutdown recommended')
  })

  // Rule 2: critical + existing escalated
  it('Rule 2: critical + already escalated → shutdown_recommended, stay escalated', () => {
    const escalatedAt = '2025-01-01T00:00:30.000Z'
    const result = evaluateActionRules(
      makeInput({
        diagnosis: makeDiagnosis({ severity: 'critical' }),
        existingIncident: makeIncident({ status: 'escalated', escalated_at: escalatedAt }),
      })
    )
    expect(result.action).toBe('shutdown_recommended')
    expect(result.incident.operation).toBe('update')
    expect(result.incident.record?.status).toBe('escalated')
    // Preserves original escalated_at
    expect(result.incident.record?.escalated_at).toBe(escalatedAt)
  })

  // Rule 3: warning + no incident
  it('Rule 3: warning + no incident → alert, create opened', () => {
    const result = evaluateActionRules(makeInput({ existingIncident: null }))
    expect(result.action).toBe('alert')
    expect(result.incident.operation).toBe('create')
    expect(result.incident.record?.status).toBe('opened')
    expect(result.reason).toContain('Elevated risk detected')
  })

  // Rule 4: warning + opened > threshold
  it('Rule 4: warning + incident older than threshold → throttle, escalate', () => {
    // Incident opened 90s before now (> 60s threshold)
    const openedAt = new Date(NOW_MS - 90000).toISOString()
    const result = evaluateActionRules(
      makeInput({ existingIncident: makeIncident({ opened_at: openedAt }) })
    )
    expect(result.action).toBe('throttle')
    expect(result.incident.operation).toBe('update')
    expect(result.incident.record?.status).toBe('escalated')
    expect(result.reason).toContain('90s')
    expect(result.reason).toContain('throttle')
  })

  // Rule 5: warning + opened < threshold
  it('Rule 5: warning + incident younger than threshold → monitor, update only', () => {
    // Incident opened 30s before now (< 60s threshold)
    const openedAt = new Date(NOW_MS - 30000).toISOString()
    const result = evaluateActionRules(
      makeInput({ existingIncident: makeIncident({ opened_at: openedAt }) })
    )
    expect(result.action).toBe('monitor')
    expect(result.incident.operation).toBe('update')
    expect(result.reason).toContain('30s')
    expect(result.reason).toContain('monitoring')
  })

  // Rule 6: info + existing opened
  it('Rule 6: info + existing opened → resolve', () => {
    const result = evaluateActionRules(
      makeInput({
        diagnosis: makeDiagnosis({ severity: 'info' }),
        existingIncident: makeIncident({ status: 'opened' }),
      })
    )
    expect(result.action).toBe('resolve')
    expect(result.incident.operation).toBe('update')
    expect(result.incident.record?.status).toBe('resolved')
    expect(result.incident.record?.resolved_at).toBe(NOW)
    expect(result.reason).toContain('resolved')
  })

  // Rule 6: info + existing escalated
  it('Rule 6: info + existing escalated → resolve', () => {
    const result = evaluateActionRules(
      makeInput({
        diagnosis: makeDiagnosis({ severity: 'info' }),
        existingIncident: makeIncident({
          status: 'escalated',
          escalated_at: '2025-01-01T00:00:30.000Z',
        }),
      })
    )
    expect(result.action).toBe('resolve')
    expect(result.incident.record?.status).toBe('resolved')
  })

  // Rule 7: info + no incident
  it('Rule 7: info + no incident → monitor, no operation', () => {
    const result = evaluateActionRules(
      makeInput({
        diagnosis: makeDiagnosis({ severity: 'info' }),
        existingIncident: null,
      })
    )
    expect(result.action).toBe('monitor')
    expect(result.incident.operation).toBe('none')
    expect(result.reason).toContain('no active incident')
  })

  // Edge: exactly at boundary
  it('Edge: threshold exactly at 60000ms → triggers escalation', () => {
    const openedAt = new Date(NOW_MS - 60000).toISOString()
    const result = evaluateActionRules(
      makeInput({ existingIncident: makeIncident({ opened_at: openedAt }) })
    )
    expect(result.action).toBe('throttle')
    expect(result.incident.record?.status).toBe('escalated')
  })

  // Edge: already escalated, warning received → stays escalated (no downgrade)
  it('Edge: warning + already escalated incident → escalation preserved', () => {
    const escalatedAt = '2025-01-01T00:00:30.000Z'
    const openedAt = new Date(NOW_MS - 90000).toISOString()
    const result = evaluateActionRules(
      makeInput({
        existingIncident: makeIncident({
          status: 'escalated',
          opened_at: openedAt,
          escalated_at: escalatedAt,
        }),
      })
    )
    expect(result.action).toBe('throttle')
    expect(result.incident.record?.status).toBe('escalated')
    // Preserves original escalated_at
    expect(result.incident.record?.escalated_at).toBe(escalatedAt)
  })

  it('Edge: 1ms before threshold → monitor, not throttle', () => {
    const openedAt = new Date(NOW_MS - 59999).toISOString()
    const result = evaluateActionRules(
      makeInput({ existingIncident: makeIncident({ opened_at: openedAt }) })
    )
    expect(result.action).toBe('monitor')
    expect(result.incident.operation).toBe('update')
  })
})
