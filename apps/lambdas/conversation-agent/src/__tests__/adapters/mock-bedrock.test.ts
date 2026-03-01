import { describe, expect, it, vi } from 'vitest'
import { MockBedrockAdapter } from '../../adapters/mock-bedrock.adapter.js'

describe('MockBedrockAdapter', () => {
  const mockTelemetry = {
    startSpan: vi.fn().mockReturnValue({ setAttribute: vi.fn(), end: vi.fn() }),
  } as never

  const adapter = new MockBedrockAdapter(mockTelemetry)

  it('returns asset status response for Risk State context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Asset ID: R-17\nRisk State: critical\nComposite Risk Score: 0.92'
    )
    expect(result).toContain('pressure seals')
    expect(result).toContain('<speak>')
  })

  it('returns fleet overview response for Elevated/Critical Assets Count context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Nominal Assets Count: 7\nElevated/Critical Assets Count: 3'
    )
    expect(result).toContain('alerts on 3 assets')
  })

  it('returns explain risk response for Z-Scores context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Z-Scores: {"joint_friction": 2.5}\nActive Incident Root Cause: Bearing wear'
    )
    expect(result).toContain('joint friction')
  })

  it('returns recommend action response for Incident Status context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Incident Status: opened\nIncident Severity: warning\nRoot Cause: Heat anomaly'
    )
    expect(result).toContain('throttle the operational speed')
  })

  it('returns generic fallback for unmatched context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Some random context'
    )
    expect(result).toContain('mock response')
  })

  it('creates a telemetry span', async () => {
    await adapter.generateResponse('prompt', 'context')
    expect(mockTelemetry.startSpan).toHaveBeenCalledWith('conversation.bedrock.invoke')
  })
})
