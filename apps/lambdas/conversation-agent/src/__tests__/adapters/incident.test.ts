import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}))

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockReturnValue({ send: mockSend }),
  },
  QueryCommand: vi.fn().mockImplementation((input) => ({ input })),
  UpdateCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

import { IncidentAdapter } from '../../adapters/incident.adapter.js'

describe('IncidentAdapter', () => {
  const mockConfig = {
    get: vi.fn((key: string) => {
      const values: Record<string, string> = {
        AWS_REGION: 'us-east-1',
        DYNAMODB_INCIDENTS_TABLE: 'test-incidents',
        NODE_ENV: 'test',
      }
      return values[key]
    }),
  } as never

  let adapter: IncidentAdapter

  beforeEach(() => {
    adapter = new IncidentAdapter(mockConfig)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('finds an opened incident for an asset', async () => {
    const incident = { incident_id: 'inc-1', asset_id: 'R-17', status: 'opened' }
    mockSend.mockResolvedValueOnce({ Items: [incident] })

    const result = await adapter.findActiveIncident('R-17')
    expect(result).toEqual(incident)
  })

  it('falls back to escalated status if no opened incident', async () => {
    const escalated = { incident_id: 'inc-2', asset_id: 'R-17', status: 'escalated' }
    mockSend.mockResolvedValueOnce({ Items: [] }) // No opened
    mockSend.mockResolvedValueOnce({ Items: [escalated] }) // Escalated found

    const result = await adapter.findActiveIncident('R-17')
    expect(result).toEqual(escalated)
  })

  it('returns null when no active incident exists', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] }) // No opened
    mockSend.mockResolvedValueOnce({ Items: [] }) // No escalated

    const result = await adapter.findActiveIncident('R-17')
    expect(result).toBeNull()
  })

  it('returns null when Items is undefined', async () => {
    mockSend.mockResolvedValueOnce({ Items: undefined }) // No opened
    mockSend.mockResolvedValueOnce({ Items: undefined }) // No escalated

    const result = await adapter.findActiveIncident('R-17')
    expect(result).toBeNull()
  })

  it('acknowledges an incident successfully', async () => {
    mockSend.mockResolvedValueOnce({})

    await expect(
      adapter.acknowledgeIncident('inc-1', '2026-02-28T12:00:00.000Z')
    ).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('throws when acknowledge fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('DynamoDB Error'))

    await expect(adapter.acknowledgeIncident('inc-1', '2026-02-28T12:00:00.000Z')).rejects.toThrow(
      'DynamoDB Error'
    )
  })
})
