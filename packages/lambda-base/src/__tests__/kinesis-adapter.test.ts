import { describe, expect, it } from 'vitest'
import { buildKinesisContexts } from '../kinesis-adapter.js'
import type { LambdaRuntimeContext } from '../types.js'

const lambdaContext: LambdaRuntimeContext = {
  awsRequestId: 'req-abc-123',
  functionName: 'ingestion',
}

describe('buildKinesisContexts', () => {
  it('extracts context for a single record', () => {
    const event = {
      Records: [
        {
          kinesis: { partitionKey: 'R-17', sequenceNumber: '100' },
          eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-telemetry',
        },
      ],
    }

    const contexts = buildKinesisContexts(event, lambdaContext)

    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toEqual({
      requestId: 'req-abc-123',
      functionName: 'ingestion',
      sourceStream: 'r17-telemetry',
      sourcePartition: 'R-17',
      sourceSequence: '100',
    })
  })

  it('extracts context for a multi-record batch', () => {
    const event = {
      Records: [
        {
          kinesis: { partitionKey: 'R-17', sequenceNumber: '100' },
          eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-telemetry',
        },
        {
          kinesis: { partitionKey: 'R-18', sequenceNumber: '101' },
          eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-telemetry',
        },
        {
          kinesis: { partitionKey: 'R-19', sequenceNumber: '102' },
          eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-ingested',
        },
      ],
    }

    const contexts = buildKinesisContexts(event, lambdaContext)

    expect(contexts).toHaveLength(3)
    expect(contexts[0].sourcePartition).toBe('R-17')
    expect(contexts[1].sourcePartition).toBe('R-18')
    expect(contexts[2].sourcePartition).toBe('R-19')
    expect(contexts[2].sourceStream).toBe('r17-ingested')
  })

  it('handles empty Records array', () => {
    const contexts = buildKinesisContexts({ Records: [] }, lambdaContext)
    expect(contexts).toEqual([])
  })

  it('extracts stream name from complex ARN', () => {
    const event = {
      Records: [
        {
          kinesis: { partitionKey: 'pk', sequenceNumber: '1' },
          eventSourceARN: 'arn:aws:kinesis:eu-west-1:999999999999:stream/my-complex-stream-name',
        },
      ],
    }

    const contexts = buildKinesisContexts(event, lambdaContext)

    expect(contexts[0].sourceStream).toBe('my-complex-stream-name')
  })
})
