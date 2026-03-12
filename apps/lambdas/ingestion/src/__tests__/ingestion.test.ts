import type { HandlerContext } from '@streaming-agents/lambda-base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type IngestionConfig, IngestionHandler } from '../ingestion.handler.js'
import { mapSourceType } from '../source-mapper.js'

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({
      end: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      setAttribute: vi.fn(),
      spanContext: vi.fn(() => ({ traceId: 'abc123def456' })),
    })),
    increment: vi.fn(),
    timing: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }
}

function makeLogger() {
  return { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() }
}

function makeProducer() {
  return {
    putRecords: vi.fn().mockResolvedValue({ total: 1, succeeded: 1, failed: 0 }),
  }
}

function makeDLQ() {
  return {
    sendToDLQ: vi.fn().mockResolvedValue(undefined),
    buildDLQMessage: vi.fn((opts: Record<string, unknown>) => ({
      error_code: opts.errorCode,
      error_message: opts.errorMessage,
      original_record: opts.originalRecord,
      source_stream: opts.sourceStream,
      source_partition: opts.sourcePartition,
      source_sequence: opts.sourceSequence,
      service: opts.service,
      failed_at: new Date().toISOString(),
      error_details: opts.errorDetails,
    })),
  }
}

function makeValidEvent(overrides?: Record<string, unknown>) {
  return {
    schema_version: 'r17.telemetry.v2',
    event_id: 'test-event-001',
    asset_id: 'R-1',
    timestamp: '2025-01-15T10:30:00.000Z',
    source: 'simulator',
    sequence: 0,
    sampling_hz: 2,
    joint_position_error_deg: 0.1,
    board_temperature_c: 38.5,
    accel_magnitude_ms2: 9.81,
    gyro_magnitude_rads: 0.02,
    control_mode: null,
    control_loop_stats: null,
    error_code: null,
    ...overrides,
  }
}

function makeKinesisRecord(data: unknown, partitionKey = 'R-1', sequenceNumber = 'seq-001') {
  return {
    kinesis: {
      data: Buffer.from(JSON.stringify(data)).toString('base64'),
      partitionKey,
      sequenceNumber,
      approximateArrivalTimestamp: Date.now() / 1000,
    },
    eventSource: 'aws:kinesis',
    eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-telemetry',
  }
}

function makeRawKinesisRecord(raw: string, partitionKey = 'R-1', sequenceNumber = 'seq-001') {
  return {
    kinesis: {
      data: Buffer.from(raw).toString('base64'),
      partitionKey,
      sequenceNumber,
      approximateArrivalTimestamp: Date.now() / 1000,
    },
    eventSource: 'aws:kinesis',
    eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-telemetry',
  }
}

const ctx: HandlerContext = { requestId: 'req-1', functionName: 'ingestion' }
const config: IngestionConfig = {
  serviceName: 'ingestion',
  inputStreamName: 'r17-telemetry',
  outputStreamName: 'r17-ingested',
  batchParallelism: 5,
}

// ── Source Mapper ────────────────────────────────────────────

describe('mapSourceType', () => {
  it('maps simulator → simulated', () => {
    expect(mapSourceType('simulator')).toBe('simulated')
  })

  it('maps reachy-daemon → edge', () => {
    expect(mapSourceType('reachy-daemon')).toBe('edge')
  })

  it('maps reachy-sdk → edge', () => {
    expect(mapSourceType('reachy-sdk')).toBe('edge')
  })

  it('maps reachy-exporter → edge', () => {
    expect(mapSourceType('reachy-exporter')).toBe('edge')
  })

  it('maps replay → replay', () => {
    expect(mapSourceType('replay')).toBe('replay')
  })
})

// ── Ingestion Handler ────────────────────────────────────────

describe('IngestionHandler', () => {
  let handler: IngestionHandler
  let producer: ReturnType<typeof makeProducer>
  let dlq: ReturnType<typeof makeDLQ>
  let telemetry: ReturnType<typeof makeTelemetry>

  beforeEach(() => {
    telemetry = makeTelemetry()
    producer = makeProducer()
    dlq = makeDLQ()
    handler = new IngestionHandler(
      config,
      telemetry as never,
      makeLogger() as never,
      producer as never,
      dlq as never
    )
  })

  it('processes a valid event and fans out to Kinesis', async () => {
    const event = { Records: [makeKinesisRecord(makeValidEvent())] }

    await handler.handle(event, ctx)

    expect(producer.putRecords).toHaveBeenCalledTimes(1)
    const records = producer.putRecords.mock.calls[0][0]
    expect(records).toHaveLength(1)
    expect(records[0].partitionKey).toBe('R-1')
    expect(records[0].data).toMatchObject({
      event_id: expect.any(String),
      trace_id: 'abc123def456',
      ingested_at: expect.any(String),
      source_partition: 'R-1',
      source_sequence: 'seq-001',
      source_type: 'simulated',
      payload: expect.objectContaining({ asset_id: 'R-1' }),
    })
  })

  it('enriches with correct source_type for edge sources', async () => {
    const event = {
      Records: [makeKinesisRecord(makeValidEvent({ source: 'reachy-daemon' }))],
    }

    await handler.handle(event, ctx)

    const enriched = producer.putRecords.mock.calls[0][0][0].data
    expect(enriched.source_type).toBe('edge')
  })

  it('sends invalid JSON to DLQ with PARSE_FAILED', async () => {
    const event = { Records: [makeRawKinesisRecord('not-json{{')] }

    await handler.handle(event, ctx)

    expect(dlq.buildDLQMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'PARSE_FAILED',
        service: 'ingestion',
      })
    )
    expect(dlq.sendToDLQ).toHaveBeenCalledTimes(1)
    expect(producer.putRecords).not.toHaveBeenCalled()
  })

  it('sends schema-invalid events to DLQ with SCHEMA_INVALID', async () => {
    const invalidEvent = { schema_version: 'r17.telemetry.v2', asset_id: 'R-1' }
    const event = { Records: [makeKinesisRecord(invalidEvent)] }

    await handler.handle(event, ctx)

    expect(dlq.buildDLQMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'SCHEMA_INVALID',
        service: 'ingestion',
      })
    )
    expect(dlq.sendToDLQ).toHaveBeenCalledTimes(1)
    expect(producer.putRecords).not.toHaveBeenCalled()
  })

  it('sends fanout failures to DLQ with FANOUT_FAILED', async () => {
    producer.putRecords.mockRejectedValueOnce(new Error('Kinesis unavailable'))
    const event = { Records: [makeKinesisRecord(makeValidEvent())] }

    await handler.handle(event, ctx)

    expect(dlq.buildDLQMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'FANOUT_FAILED',
        service: 'ingestion',
      })
    )
    expect(dlq.sendToDLQ).toHaveBeenCalledTimes(1)
  })

  it('processes multiple records in a batch', async () => {
    const event = {
      Records: [
        makeKinesisRecord(makeValidEvent({ asset_id: 'R-1' }), 'R-1', 'seq-001'),
        makeKinesisRecord(makeValidEvent({ asset_id: 'R-2' }), 'R-2', 'seq-002'),
        makeKinesisRecord(makeValidEvent({ asset_id: 'R-3' }), 'R-3', 'seq-003'),
      ],
    }

    await handler.handle(event, ctx)

    expect(producer.putRecords).toHaveBeenCalledTimes(3)
  })

  it('continues processing after one record fails', async () => {
    const event = {
      Records: [
        makeRawKinesisRecord('bad-json'),
        makeKinesisRecord(makeValidEvent({ asset_id: 'R-2' }), 'R-2', 'seq-002'),
      ],
    }

    await handler.handle(event, ctx)

    // First record fails → DLQ; second record succeeds → fan-out
    expect(dlq.sendToDLQ).toHaveBeenCalledTimes(1)
    expect(producer.putRecords).toHaveBeenCalledTimes(1)
  })

  it('creates OTel span with correct attributes', async () => {
    const event = { Records: [makeKinesisRecord(makeValidEvent())] }

    await handler.handle(event, ctx)

    expect(telemetry.startSpan).toHaveBeenCalledWith(
      'ingestion.process',
      expect.objectContaining({
        'telemetry.asset_id': 'R-1',
        'telemetry.source_type': 'simulated',
        'telemetry.schema_version': 'r17.telemetry.v2',
      })
    )
  })

  it('increments events_processed metric with valid status', async () => {
    const event = { Records: [makeKinesisRecord(makeValidEvent())] }

    await handler.handle(event, ctx)

    expect(telemetry.increment).toHaveBeenCalledWith(
      'ingestion.events_processed',
      expect.objectContaining({ status: 'valid', source_type: 'simulated' })
    )
  })

  it('increments events_processed metric with invalid status on parse failure', async () => {
    const event = { Records: [makeRawKinesisRecord('not-json')] }

    await handler.handle(event, ctx)

    expect(telemetry.increment).toHaveBeenCalledWith(
      'ingestion.events_processed',
      expect.objectContaining({ status: 'invalid' })
    )
  })

  it('extracts stream name from event source ARN', async () => {
    const event = { Records: [makeRawKinesisRecord('bad')] }

    await handler.handle(event, ctx)

    const dlqCall = dlq.buildDLQMessage.mock.calls[0][0]
    expect(dlqCall.sourceStream).toBe('r17-telemetry')
  })

  it('includes Zod error details in DLQ for schema-invalid events', async () => {
    const invalidEvent = {
      schema_version: 'r17.telemetry.v2',
      event_id: 'e1',
      asset_id: 'R-1',
      timestamp: '2025-01-15T10:30:00.000Z',
      source: 'simulator',
      sequence: 0,
      sampling_hz: 2,
      joint_position_error_deg: -1, // invalid: must be nonnegative
    }
    const event = { Records: [makeKinesisRecord(invalidEvent)] }

    await handler.handle(event, ctx)

    const dlqCall = dlq.buildDLQMessage.mock.calls[0][0]
    expect(dlqCall.errorDetails).toBeDefined()
    expect(Array.isArray(dlqCall.errorDetails)).toBe(true)
  })

  it('respects batch parallelism chunking', async () => {
    const smallConfig: IngestionConfig = { ...config, batchParallelism: 2 }
    const smallHandler = new IngestionHandler(
      smallConfig,
      telemetry as never,
      makeLogger() as never,
      producer as never,
      dlq as never
    )

    const event = {
      Records: [
        makeKinesisRecord(makeValidEvent({ asset_id: 'R-1' }), 'R-1', 'seq-001'),
        makeKinesisRecord(makeValidEvent({ asset_id: 'R-2' }), 'R-2', 'seq-002'),
        makeKinesisRecord(makeValidEvent({ asset_id: 'R-3' }), 'R-3', 'seq-003'),
      ],
    }

    await smallHandler.handle(event, ctx)

    // All 3 records should be processed (2 in first chunk, 1 in second)
    expect(producer.putRecords).toHaveBeenCalledTimes(3)
  })
})
