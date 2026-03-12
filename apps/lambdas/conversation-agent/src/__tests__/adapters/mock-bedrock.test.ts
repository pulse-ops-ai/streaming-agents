import { describe, expect, it, vi } from 'vitest'
import { MockBedrockAdapter } from '../../adapters/mock-bedrock.adapter.js'

describe('MockBedrockAdapter', () => {
  const mockTelemetry = {
    startSpan: vi.fn().mockReturnValue({ setAttribute: vi.fn(), end: vi.fn() }),
  } as never

  const adapter = new MockBedrockAdapter(mockTelemetry)

  it('returns BedrockResponse with usage for Risk State context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Asset ID: R-17\nRisk State: critical\nComposite Risk Score: 0.92'
    )
    expect(result.text).toContain('well above baseline')
    expect(result.text).not.toContain('<speak>')
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50, total_tokens: 150 })
    expect(result.model_id).toBe('mock-claude')
  })

  it('returns concise fleet overview response for At-risk context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Total assets: 5\nAt-risk (3):\n- R-17: critical'
    )
    expect(result.text).toContain('need attention')
    expect(result.text).not.toContain('<speak>')
  })

  it('returns concise explain risk response for Active Incident Root Cause context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Risk State: critical\nActive Incident Root Cause: Bearing wear'
    )
    expect(result.text).toContain('progressive joint degradation')
    expect(result.text).not.toContain('<speak>')
  })

  it('returns concise recommend action response for Incident Status context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Incident Status: opened\nIncident Severity: warning\nRoot Cause: Heat anomaly'
    )
    expect(result.text).toContain('actuator inspection')
    expect(result.text).not.toContain('<speak>')
  })

  it('returns generic fallback for unmatched context', async () => {
    const result = await adapter.generateResponse(
      'You are a maintenance copilot',
      'Some random context'
    )
    expect(result.text).toContain('mock response')
  })

  it('creates a telemetry span', async () => {
    await adapter.generateResponse('prompt', 'context')
    expect(mockTelemetry.startSpan).toHaveBeenCalledWith('conversation.bedrock.invoke')
  })
})
