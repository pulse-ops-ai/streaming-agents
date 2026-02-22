import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KinesisProducer } from '../producer.js'
import type { ProducerRecord } from '../types.js'

function makeKinesisClient(handler: (input: unknown) => unknown = () => ({ Records: [] })) {
  return { send: vi.fn(handler) } as never
}

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({
      end: vi.fn(),
      recordException: vi.fn(),
    })),
    increment: vi.fn(),
  } as never
}

function makeRecords(count: number): ProducerRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    data: { index: i, value: `record-${i}` },
    partitionKey: `asset-${i % 3}`,
  }))
}

describe('KinesisProducer', () => {
  let telemetry: ReturnType<typeof makeTelemetry>

  beforeEach(() => {
    telemetry = makeTelemetry()
  })

  it('sends records in a single batch when under batch size', async () => {
    const client = makeKinesisClient(() => ({
      Records: [{ SequenceNumber: '1' }, { SequenceNumber: '2' }],
    }))
    const producer = new KinesisProducer(client, 'test-stream', telemetry, 25)

    const result = await producer.putRecords(makeRecords(2))

    expect(result).toEqual({ total: 2, succeeded: 2, failed: 0 })
    expect(client.send).toHaveBeenCalledTimes(1)
  })

  it('splits records into multiple batches at batch size boundary', async () => {
    const client = makeKinesisClient((input: unknown) => {
      const cmd = input as { input: { Records: unknown[] } }
      const count = cmd.input.Records.length
      return {
        Records: Array.from({ length: count }, () => ({ SequenceNumber: '1' })),
      }
    })
    const producer = new KinesisProducer(client, 'test-stream', telemetry, 3)

    const result = await producer.putRecords(makeRecords(7))

    expect(result).toEqual({ total: 7, succeeded: 7, failed: 0 })
    // 7 records / batch size 3 = 3 batches (3 + 3 + 1)
    expect(client.send).toHaveBeenCalledTimes(3)
  })

  it('retries partial failures with exponential backoff', async () => {
    let callCount = 0
    const client = makeKinesisClient(() => {
      callCount++
      if (callCount === 1) {
        // First call: 1 success, 1 failure
        return {
          FailedRecordCount: 1,
          Records: [
            { SequenceNumber: '1' },
            { ErrorCode: 'ProvisionedThroughputExceededException' },
          ],
        }
      }
      // Retry: all succeed
      return { Records: [{ SequenceNumber: '2' }] }
    })
    const producer = new KinesisProducer(client, 'test-stream', telemetry, 25)

    const result = await producer.putRecords(makeRecords(2))

    expect(result).toEqual({ total: 2, succeeded: 2, failed: 0 })
    expect(client.send).toHaveBeenCalledTimes(2)
  })

  it('reports failures after max retries exhausted', async () => {
    const client = makeKinesisClient(() => ({
      FailedRecordCount: 2,
      Records: [{ ErrorCode: 'InternalFailure' }, { ErrorCode: 'InternalFailure' }],
    }))
    const producer = new KinesisProducer(client, 'test-stream', telemetry, 25)

    const result = await producer.putRecords(makeRecords(2))

    expect(result.total).toBe(2)
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(2)
    // 3 attempts (initial + 2 retries)
    expect(client.send).toHaveBeenCalledTimes(3)
  })

  it('serializes record data as JSON', async () => {
    const client = makeKinesisClient(() => ({
      Records: [{ SequenceNumber: '1' }],
    }))
    const producer = new KinesisProducer(client, 'test-stream', telemetry, 25)

    await producer.putRecords([{ data: { key: 'value' }, partitionKey: 'pk' }])

    const sentCommand = (client.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const sentData = Buffer.from(sentCommand.input.Records[0].Data).toString('utf-8')
    expect(JSON.parse(sentData)).toEqual({ key: 'value' })
    expect(sentCommand.input.Records[0].PartitionKey).toBe('pk')
    expect(sentCommand.input.StreamName).toBe('test-stream')
  })

  it('handles empty records array', async () => {
    const client = makeKinesisClient()
    const producer = new KinesisProducer(client, 'test-stream', telemetry, 25)

    const result = await producer.putRecords([])

    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0 })
    expect(client.send).not.toHaveBeenCalled()
  })

  it('clamps batch size to Kinesis max of 500', async () => {
    const client = makeKinesisClient((input: unknown) => {
      const cmd = input as { input: { Records: unknown[] } }
      const count = cmd.input.Records.length
      return {
        Records: Array.from({ length: count }, () => ({ SequenceNumber: '1' })),
      }
    })
    // Request batch size 1000 — should clamp to 500
    const producer = new KinesisProducer(client, 'test-stream', telemetry, 1000)

    const result = await producer.putRecords(makeRecords(600))

    expect(result).toEqual({ total: 600, succeeded: 600, failed: 0 })
    // 600 / 500 = 2 batches
    expect(client.send).toHaveBeenCalledTimes(2)
  })
})
