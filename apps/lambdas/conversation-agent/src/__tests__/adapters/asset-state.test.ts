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
  GetCommand: vi.fn().mockImplementation((input) => ({ input })),
  ScanCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

import { AssetStateAdapter } from '../../adapters/asset-state.adapter.js'

describe('AssetStateAdapter', () => {
  const mockConfig = {
    get: vi.fn((key: string) => {
      const values: Record<string, string> = {
        AWS_REGION: 'us-east-1',
        DYNAMODB_ASSET_TABLE: 'test-asset-state',
        NODE_ENV: 'test',
      }
      return values[key]
    }),
  } as never

  let adapter: AssetStateAdapter

  beforeEach(() => {
    adapter = new AssetStateAdapter(mockConfig)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns asset state for a valid asset ID', async () => {
    const mockAsset = { asset_id: 'R-17', risk_state: 'nominal', composite_risk: 0.1 }
    mockSend.mockResolvedValueOnce({ Item: mockAsset })

    const result = await adapter.getAssetState('R-17')
    expect(result).toEqual(mockAsset)
  })

  it('returns null when asset does not exist', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined })

    const result = await adapter.getAssetState('R-999')
    expect(result).toBeNull()
  })

  it('scans all assets', async () => {
    const assets = [
      { asset_id: 'R-1', risk_state: 'nominal' },
      { asset_id: 'R-2', risk_state: 'critical' },
    ]
    mockSend.mockResolvedValueOnce({ Items: assets })

    const result = await adapter.scanAllAssets()
    expect(result).toEqual(assets)
  })

  it('returns empty array when no assets exist', async () => {
    mockSend.mockResolvedValueOnce({ Items: undefined })

    const result = await adapter.scanAllAssets()
    expect(result).toEqual([])
  })

  it('scans non-nominal assets only', async () => {
    const assets = [
      { asset_id: 'R-1', risk_state: 'nominal' },
      { asset_id: 'R-2', risk_state: 'critical' },
      { asset_id: 'R-3', risk_state: 'elevated' },
    ]
    mockSend.mockResolvedValueOnce({ Items: assets })

    const result = await adapter.scanNonNominalAssets()
    expect(result).toHaveLength(2)
    expect(result.map((a) => a.asset_id)).toEqual(['R-2', 'R-3'])
  })
})
