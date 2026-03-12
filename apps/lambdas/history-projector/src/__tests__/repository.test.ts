import { describe, expect, it, vi } from 'vitest'
import { HistoryRepository, type HistoryRow } from '../adapters/dynamodb.adapter.js'

function makeRow(index: number): HistoryRow {
  return {
    asset_id: `R-${index}`,
    timestamp: `2026-03-10T12:00:${String(index).padStart(2, '0')}.000Z`,
    composite_risk: 0.5,
    risk_state: 'nominal',
    z_scores: { position_error_z: 0, accel_z: 0, gyro_z: 0, temperature_z: 0 },
    last_values: {
      board_temperature_c: 38,
      accel_magnitude_ms2: 9.8,
      gyro_magnitude_rads: 0.02,
      joint_position_error_deg: 0.1,
      control_loop_freq_hz: 100,
    },
    threshold_breach: 0,
    contributing_signals: [],
    expires_at: 1741651200,
  }
}

describe('HistoryRepository', () => {
  it('writes a single batch of ≤25 items', async () => {
    const mockClient = { send: vi.fn().mockResolvedValue({}) }
    const repo = new HistoryRepository(mockClient as never, 'test-table')

    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i))
    await repo.batchWrite(rows)

    expect(mockClient.send).toHaveBeenCalledTimes(1)
    const cmd = mockClient.send.mock.calls[0][0]
    expect(cmd.input.RequestItems['test-table']).toHaveLength(5)
  })

  it('chunks into multiple batches of 25', async () => {
    const mockClient = { send: vi.fn().mockResolvedValue({}) }
    const repo = new HistoryRepository(mockClient as never, 'test-table')

    const rows = Array.from({ length: 60 }, (_, i) => makeRow(i))
    await repo.batchWrite(rows)

    // 60 items → 3 batches: 25 + 25 + 10
    expect(mockClient.send).toHaveBeenCalledTimes(3)
    expect(mockClient.send.mock.calls[0][0].input.RequestItems['test-table']).toHaveLength(25)
    expect(mockClient.send.mock.calls[1][0].input.RequestItems['test-table']).toHaveLength(25)
    expect(mockClient.send.mock.calls[2][0].input.RequestItems['test-table']).toHaveLength(10)
  })

  it('handles empty array without calling DynamoDB', async () => {
    const mockClient = { send: vi.fn() }
    const repo = new HistoryRepository(mockClient as never, 'test-table')

    await repo.batchWrite([])

    expect(mockClient.send).not.toHaveBeenCalled()
  })
})
