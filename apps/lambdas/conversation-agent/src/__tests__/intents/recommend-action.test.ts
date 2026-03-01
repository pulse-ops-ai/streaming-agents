import { describe, expect, it, vi } from 'vitest'
import { RecommendActionHandler } from '../../intents/recommend-action.handler.js'

describe('RecommendActionHandler', () => {
  const mockIncident = { findActiveIncident: vi.fn() } as never
  const mockBedrock = { generateResponse: vi.fn() } as never

  const handler = new RecommendActionHandler(mockIncident, mockBedrock)

  const createEvent = (assetId?: string) =>
    ({
      sessionState: {
        intent: {
          name: 'RecommendAction',
          slots: assetId ? { asset_id: { value: { interpretedValue: assetId } } } : {},
        },
      },
    }) as never

  it('handles missing asset_id slot', async () => {
    const res = await handler.handle(createEvent())
    expect(res.message).toContain('Which robot do you want recommendations for?')
  })

  it('handles asset with no active incident', async () => {
    mockIncident.findActiveIncident.mockResolvedValueOnce(null)
    const res = await handler.handle(createEvent('R-17'))
    expect(res.message).toContain('no active incident for R-17')
    expect(mockBedrock.generateResponse).not.toHaveBeenCalled()
  })

  it('delegates to Bedrock with incident severity speechContext', async () => {
    mockIncident.findActiveIncident.mockResolvedValueOnce({
      status: 'opened',
      severity: 'warning',
      root_cause: 'Heat signature anomaly',
    })
    mockBedrock.generateResponse.mockResolvedValueOnce('I recommend a cooling cycle.')

    const res = await handler.handle(createEvent('R-17'))
    expect(mockBedrock.generateResponse).toHaveBeenCalled()
    expect(res.message).toBe('I recommend a cooling cycle.')
    expect(res.speechContext).toEqual({
      severity: 'warning',
      intentName: 'RecommendAction',
      hasIncident: true,
    })
  })

  it('uses critical severity for critical incidents', async () => {
    mockIncident.findActiveIncident.mockResolvedValueOnce({
      status: 'escalated',
      severity: 'critical',
      root_cause: 'Pressure seal failure',
    })
    mockBedrock.generateResponse.mockResolvedValueOnce('Shut down immediately.')

    const res = await handler.handle(createEvent('R-17'))
    expect(res.speechContext?.severity).toBe('critical')
  })
})
