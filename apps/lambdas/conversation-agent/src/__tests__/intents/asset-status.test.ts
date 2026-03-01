import { describe, expect, it, vi } from 'vitest'
import { AssetStatusHandler } from '../../intents/asset-status.handler.js'

describe('AssetStatusHandler', () => {
  const mockAdapter = { getAssetState: vi.fn() } as never
  const mockBedrock = { generateResponse: vi.fn() } as never

  const handler = new AssetStatusHandler(mockAdapter, mockBedrock)

  const createEvent = (assetId?: string) =>
    ({
      sessionState: {
        intent: {
          name: 'AssetStatus',
          slots: assetId ? { asset_id: { value: { interpretedValue: assetId } } } : {},
        },
      },
    }) as never

  it('handles missing asset_id slot', async () => {
    const res = await handler.handle(createEvent())
    expect(res.message).toContain('Which robot are you asking about?')
  })

  it('handles unknown asset', async () => {
    mockAdapter.getAssetState.mockResolvedValueOnce(null)
    const res = await handler.handle(createEvent('R-999'))
    expect(res.message).toContain("I don't have any data for R-999")
  })

  it('handles nominal asset shortcut without Bedrock', async () => {
    mockAdapter.getAssetState.mockResolvedValueOnce({
      risk_state: 'nominal',
    })
    const res = await handler.handle(createEvent('R-17'))
    expect(res.message).toContain('R-17 is operating normally')
    expect(mockBedrock.generateResponse).not.toHaveBeenCalled()
  })

  it('delegates elevated asset to Bedrock with warning speechContext', async () => {
    mockAdapter.getAssetState.mockResolvedValueOnce({
      risk_state: 'elevated',
      composite_risk: 0.8,
      last_values: {},
    })
    mockBedrock.generateResponse.mockResolvedValueOnce('Temperature is high.')

    const res = await handler.handle(createEvent('R-17'))
    expect(mockBedrock.generateResponse).toHaveBeenCalled()
    expect(res.message).toBe('Temperature is high.')
    expect(res.speechContext).toEqual({
      severity: 'warning',
      intentName: 'AssetStatus',
      hasIncident: false,
    })
  })

  it('delegates critical asset to Bedrock with critical speechContext', async () => {
    mockAdapter.getAssetState.mockResolvedValueOnce({
      risk_state: 'critical',
      composite_risk: 0.95,
      last_values: {},
    })
    mockBedrock.generateResponse.mockResolvedValueOnce('Pressure seal failure detected.')

    const res = await handler.handle(createEvent('R-17'))
    expect(res.speechContext).toEqual({
      severity: 'critical',
      intentName: 'AssetStatus',
      hasIncident: false,
    })
  })
})
