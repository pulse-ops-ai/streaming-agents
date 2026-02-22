import { describe, expect, it } from 'vitest'
import { KinesisConsumer } from '../consumer.js'
import type { KinesisStreamEvent } from '../types.js'

function makeKinesisRecord(data: unknown, partitionKey = 'asset-1', sequence = '123') {
  return {
    kinesis: {
      data: Buffer.from(JSON.stringify(data)).toString('base64'),
      partitionKey,
      sequenceNumber: sequence,
      approximateArrivalTimestamp: 1700000000,
    },
    eventSource: 'aws:kinesis',
    eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/test',
  }
}

describe('KinesisConsumer', () => {
  const consumer = new KinesisConsumer()

  it('base64 decodes and JSON parses a single record', () => {
    const event: KinesisStreamEvent = {
      Records: [makeKinesisRecord({ schema_version: 'v2', asset_id: 'R-17' })],
    }

    const results = consumer.parseRecords<{ schema_version: string; asset_id: string }>(event)

    expect(results).toHaveLength(1)
    expect(results[0].data).toEqual({ schema_version: 'v2', asset_id: 'R-17' })
    expect(results[0].partitionKey).toBe('asset-1')
    expect(results[0].sequenceNumber).toBe('123')
    expect(results[0].approximateArrivalTimestamp).toBe(1700000000)
  })

  it('parses a multi-record batch', () => {
    const event: KinesisStreamEvent = {
      Records: [
        makeKinesisRecord({ id: 1 }, 'asset-1', '100'),
        makeKinesisRecord({ id: 2 }, 'asset-2', '101'),
        makeKinesisRecord({ id: 3 }, 'asset-3', '102'),
      ],
    }

    const results = consumer.parseRecords<{ id: number }>(event)

    expect(results).toHaveLength(3)
    expect(results[0].data.id).toBe(1)
    expect(results[1].data.id).toBe(2)
    expect(results[2].data.id).toBe(3)
    expect(results[0].partitionKey).toBe('asset-1')
    expect(results[1].partitionKey).toBe('asset-2')
    expect(results[2].partitionKey).toBe('asset-3')
  })

  it('throws on invalid base64 data', () => {
    const event: KinesisStreamEvent = {
      Records: [
        {
          kinesis: {
            data: '!!!not-base64!!!',
            partitionKey: 'pk',
            sequenceNumber: '1',
            approximateArrivalTimestamp: 0,
          },
          eventSource: 'aws:kinesis',
          eventSourceARN: 'arn:test',
        },
      ],
    }

    // Invalid base64 decodes to garbage that won't parse as JSON
    expect(() => consumer.parseRecords(event)).toThrow()
  })

  it('throws on valid base64 but invalid JSON', () => {
    const event: KinesisStreamEvent = {
      Records: [
        {
          kinesis: {
            data: Buffer.from('not json at all {{{').toString('base64'),
            partitionKey: 'pk',
            sequenceNumber: '1',
            approximateArrivalTimestamp: 0,
          },
          eventSource: 'aws:kinesis',
          eventSourceARN: 'arn:test',
        },
      ],
    }

    expect(() => consumer.parseRecords(event)).toThrow(SyntaxError)
  })

  it('handles empty Records array', () => {
    const event: KinesisStreamEvent = { Records: [] }
    const results = consumer.parseRecords(event)
    expect(results).toEqual([])
  })
})
