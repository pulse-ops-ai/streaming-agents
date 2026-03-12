import { describe, expect, it, vi } from 'vitest'
import { FleetOverviewHandler } from '../../intents/fleet-overview.handler.js'

describe('FleetOverviewHandler', () => {
  const mockAdapter = { scanAllAssets: vi.fn() } as never
  const mockBedrock = { generateResponse: vi.fn() } as never

  const handler = new FleetOverviewHandler(mockAdapter, mockBedrock)

  const event = {
    sessionState: { intent: { name: 'FleetOverview' } },
  } as never

  it('handles an empty fleet', async () => {
    mockAdapter.scanAllAssets.mockResolvedValueOnce([])
    const res = await handler.handle(event)
    expect(res.message).toContain('no active robots')
  })

  it('handles a perfectly nominal fleet shortcut without Bedrock', async () => {
    mockAdapter.scanAllAssets.mockResolvedValueOnce([
      { risk_state: 'nominal' },
      { risk_state: 'nominal' },
    ])
    const res = await handler.handle(event)
    expect(res.message).toContain('All 2 robots are operating normally')
    expect(mockBedrock.generateResponse).not.toHaveBeenCalled()
  })

  it('delegates anomalous fleet to Bedrock with critical speechContext and token usage', async () => {
    mockAdapter.scanAllAssets.mockResolvedValueOnce([
      { risk_state: 'nominal' },
      { asset_id: 'R-17', risk_state: 'critical', composite_risk: 0.95 },
    ])
    mockBedrock.generateResponse.mockResolvedValueOnce({
      text: 'R-17 is critical.',
      usage: { input_tokens: 200, output_tokens: 25, total_tokens: 225 },
      model_id: 'test-model',
    })

    const res = await handler.handle(event)
    expect(mockBedrock.generateResponse).toHaveBeenCalled()
    expect(res.message).toBe('R-17 is critical.')
    expect(res.speechContext).toEqual({
      severity: 'critical',
      intentName: 'FleetOverview',
      hasIncident: true,
    })
    expect(res.meta?.input_tokens).toBe(200)
    expect(res.meta?.output_tokens).toBe(25)
    expect(res.meta?.total_tokens).toBe(225)
  })

  it('uses warning severity when no critical assets', async () => {
    mockAdapter.scanAllAssets.mockResolvedValueOnce([
      { risk_state: 'nominal' },
      { asset_id: 'R-50', risk_state: 'elevated', composite_risk: 0.7 },
    ])
    mockBedrock.generateResponse.mockResolvedValueOnce({
      text: 'R-50 is elevated.',
      usage: { input_tokens: 180, output_tokens: 20, total_tokens: 200 },
      model_id: 'test-model',
    })

    const res = await handler.handle(event)
    expect(res.speechContext?.severity).toBe('warning')
  })
})
