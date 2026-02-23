import type { RiskEvent } from '@streaming-agents/core-contracts'
import { describe, expect, it } from 'vitest'
import { buildDiagnosisPrompt } from '../prompt.js'

function makeRiskEvent(overrides?: Partial<RiskEvent>): RiskEvent {
  return {
    event_id: 'evt-1',
    trace_id: 'trace-abc',
    asset_id: 'robot-17',
    timestamp: '2025-01-01T00:00:00Z',
    composite_risk: 0.72,
    risk_state: 'elevated',
    z_scores: {
      position_error_z: 2.8,
      accel_z: 0.5,
      gyro_z: 0.3,
      temperature_z: 1.1,
    },
    threshold_breach: 0.5,
    contributing_signals: ['joint_position_error_deg'],
    last_values: {
      board_temperature_c: 52.3,
      accel_magnitude_ms2: 1.2,
      gyro_magnitude_rads: 0.4,
      joint_position_error_deg: 3.5,
      control_loop_freq_hz: 100,
    },
    ...overrides,
  }
}

describe('buildDiagnosisPrompt', () => {
  it('includes asset_id in the user message', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('robot-17')
  })

  it('includes risk_state in the user message', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('elevated')
  })

  it('includes composite risk score', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('0.720')
  })

  it('includes z-scores for all signals', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('2.80') // position_error_z
    expect(user).toContain('0.50') // accel_z
    expect(user).toContain('0.30') // gyro_z
    expect(user).toContain('1.10') // temperature_z
  })

  it('marks contributing signals as YES', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    // joint_position_error_deg is contributing
    const lines = user.split('\n')
    const jointLine = lines.find((l) => l.includes('Joint Position Error'))
    expect(jointLine).toContain('YES')
  })

  it('marks non-contributing signals as no', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    const lines = user.split('\n')
    const accelLine = lines.find((l) => l.includes('Acceleration'))
    expect(accelLine).toContain('| no |')
  })

  it('includes signal descriptions', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('Actuator positioning accuracy')
    expect(user).toContain('Vibration/acceleration magnitude')
    expect(user).toContain('Rotational velocity')
    expect(user).toContain('Electronics temperature')
  })

  it('includes required JSON format in user message', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('"root_cause"')
    expect(user).toContain('"evidence"')
    expect(user).toContain('"confidence"')
    expect(user).toContain('"recommended_actions"')
    expect(user).toContain('"severity"')
  })

  it('system message tells LLM to analyze and explain', () => {
    const { system } = buildDiagnosisPrompt(makeRiskEvent())
    expect(system).toContain('predictive maintenance')
    expect(system).toContain('Analyze the sensor data')
    expect(system).toContain('JSON format')
  })

  it('does NOT ask LLM to compute risk scores', () => {
    const { system, user } = buildDiagnosisPrompt(makeRiskEvent())
    const combined = system + user
    expect(combined).not.toContain('compute risk')
    expect(combined).not.toContain('calculate risk')
    expect(combined).not.toContain('determine the risk score')
  })

  it('includes threshold breach value', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('0.5')
    expect(user).toContain('Threshold Breach')
  })

  it('includes raw signal values', () => {
    const { user } = buildDiagnosisPrompt(makeRiskEvent())
    expect(user).toContain('52.3') // board_temperature_c
    expect(user).toContain('3.5') // joint_position_error_deg
  })

  it('handles critical risk state', () => {
    const { user } = buildDiagnosisPrompt(
      makeRiskEvent({ risk_state: 'critical', composite_risk: 0.85 })
    )
    expect(user).toContain('critical')
    expect(user).toContain('0.850')
  })

  it('handles multiple contributing signals', () => {
    const { user } = buildDiagnosisPrompt(
      makeRiskEvent({
        contributing_signals: ['joint_position_error_deg', 'board_temperature_c'],
      })
    )
    const lines = user.split('\n')
    const jointLine = lines.find((l) => l.includes('Joint Position Error'))
    const tempLine = lines.find((l) => l.includes('Board Temperature'))
    expect(jointLine).toContain('YES')
    expect(tempLine).toContain('YES')
  })
})
