import { describe, expect, it, vi } from 'vitest'
import { AcknowledgeIncidentHandler } from '../../intents/acknowledge.handler.js'

describe('AcknowledgeIncidentHandler', () => {
  const mockIncident = {
    findActiveIncident: vi.fn(),
    acknowledgeIncident: vi.fn(),
  } as never

  const handler = new AcknowledgeIncidentHandler(mockIncident)

  const createEvent = (assetId?: string) =>
    ({
      sessionState: {
        intent: {
          name: 'AcknowledgeIncident',
          slots: assetId ? { asset_id: { value: { interpretedValue: assetId } } } : {},
        },
      },
    }) as never

  it('handles missing asset_id slot', async () => {
    const res = await handler.handle(createEvent())
    expect(res.message).toContain("Which robot's alert are you acknowledging?")
  })

  it('handles asset with no active incident', async () => {
    mockIncident.findActiveIncident.mockResolvedValueOnce(null)
    const res = await handler.handle(createEvent('R-17'))
    expect(res.message).toContain('no active incident for R-17 to acknowledge')
  })

  it('updates the incident record and returns confirmation with speechContext', async () => {
    mockIncident.findActiveIncident.mockResolvedValueOnce({
      incident_id: 'inc-123',
      severity: 'critical',
    })
    mockIncident.acknowledgeIncident.mockResolvedValueOnce(undefined)

    const res = await handler.handle(createEvent('R-17'))

    expect(mockIncident.acknowledgeIncident).toHaveBeenCalledWith('inc-123', expect.any(String))
    expect(res.message).toContain('logged your acknowledgment for the critical incident on R-17')
    expect(res.speechContext).toEqual({
      severity: 'info',
      intentName: 'AcknowledgeIncident',
      hasIncident: true,
    })
  })
})
