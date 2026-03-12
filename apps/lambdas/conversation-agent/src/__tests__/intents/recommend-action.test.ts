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

  it('delegates to Bedrock with incident severity and token usage', async () => {
    mockIncident.findActiveIncident.mockResolvedValueOnce({
      status: 'opened',
      severity: 'warning',
      root_cause: 'Heat signature anomaly',
    })
    mockBedrock.generateResponse.mockResolvedValueOnce({
      text: 'I recommend a cooling cycle.',
      usage: { input_tokens: 150, output_tokens: 20, total_tokens: 170 },
      model_id: 'test-model',
    })

    const res = await handler.handle(createEvent('R-17'))
    expect(mockBedrock.generateResponse).toHaveBeenCalled()
    expect(res.message).toBe('I recommend a cooling cycle.')
    expect(res.speechContext).toEqual({
      severity: 'warning',
      intentName: 'RecommendAction',
      hasIncident: true,
    })
    expect(res.meta?.input_tokens).toBe(150)
    expect(res.meta?.total_tokens).toBe(170)
    expect(res.meta?.bedrock_model_id).toBe('test-model')
  })

  it('uses critical severity for critical incidents', async () => {
    mockIncident.findActiveIncident.mockResolvedValueOnce({
      status: 'escalated',
      severity: 'critical',
      root_cause: 'Pressure seal failure',
    })
    mockBedrock.generateResponse.mockResolvedValueOnce({
      text: 'Shut down immediately.',
      usage: { input_tokens: 130, output_tokens: 15, total_tokens: 145 },
      model_id: 'test-model',
    })

    const res = await handler.handle(createEvent('R-17'))
    expect(res.speechContext?.severity).toBe('critical')
  })
})
