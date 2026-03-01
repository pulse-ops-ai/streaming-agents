import { describe, expect, it, vi } from 'vitest'
import { ExplainRiskHandler } from '../../intents/explain-risk.handler.js'

describe('ExplainRiskHandler', () => {
  const mockAssetState = { getAssetState: vi.fn() } as never
  const mockIncident = { findActiveIncident: vi.fn() } as never
  const mockBedrock = { generateResponse: vi.fn() } as never

  const handler = new ExplainRiskHandler(mockAssetState, mockIncident, mockBedrock)

  const createEvent = (assetId?: string) =>
    ({
      sessionState: {
        intent: {
          name: 'ExplainRisk',
          slots: assetId ? { asset_id: { value: { interpretedValue: assetId } } } : {},
        },
      },
    }) as never

  it('handles missing asset_id slot', async () => {
    const res = await handler.handle(createEvent())
    expect(res.message).toContain('Which robot do you need explained?')
  })

  it('handles unknown asset with no data', async () => {
    mockAssetState.getAssetState.mockResolvedValueOnce(null)
    mockIncident.findActiveIncident.mockResolvedValueOnce(null)
    const res = await handler.handle(createEvent('R-999'))
    expect(res.message).toContain("couldn't find any data")
  })

  it('handles nominal asset shortcut without Bedrock', async () => {
    mockAssetState.getAssetState.mockResolvedValueOnce({ risk_state: 'nominal' })
    mockIncident.findActiveIncident.mockResolvedValueOnce(null)
    const res = await handler.handle(createEvent('R-17'))
    expect(res.message).toContain('operating normally right now')
    expect(mockBedrock.generateResponse).not.toHaveBeenCalled()
  })

  it('delegates to Bedrock when incident is present', async () => {
    mockAssetState.getAssetState.mockResolvedValueOnce({ risk_state: 'critical' })
    mockIncident.findActiveIncident.mockResolvedValueOnce({ root_cause: 'Bearing wear' })
    mockBedrock.generateResponse.mockResolvedValueOnce('The friction is high causing bearing wear.')

    const res = await handler.handle(createEvent('R-17'))
    expect(mockBedrock.generateResponse).toHaveBeenCalled()
    expect(res.message).toBe('The friction is high causing bearing wear.')
    // Fallback SSML wrap logic verify
    expect(res.ssml).toBe('<speak>The friction is high causing bearing wear.</speak>')
  })
})
