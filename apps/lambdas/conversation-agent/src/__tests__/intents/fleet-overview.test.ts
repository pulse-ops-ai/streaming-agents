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

  it('delegates anomalous fleet to Bedrock', async () => {
    mockAdapter.scanAllAssets.mockResolvedValueOnce([
      { risk_state: 'nominal' },
      { asset_id: 'R-17', risk_state: 'critical', composite_risk: 0.95 },
    ])
    mockBedrock.generateResponse.mockResolvedValueOnce('<speak>R-17 is critical.</speak>')

    const res = await handler.handle(event)
    expect(mockBedrock.generateResponse).toHaveBeenCalled()
    expect(res.ssml).toBe('<speak>R-17 is critical.</speak>')
    expect(res.message).toBe('R-17 is critical.')
  })
})
