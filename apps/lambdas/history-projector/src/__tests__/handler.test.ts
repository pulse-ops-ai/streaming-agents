import type { RiskEvent } from '@streaming-agents/core-contracts'
import type { HandlerContext } from '@streaming-agents/lambda-base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryRow } from '../adapters/dynamodb.adapter.js'
import {
  type HistoryProjectorConfig,
  HistoryProjectorHandler,
} from '../history-projector.handler.js'

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({
      end: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      setAttribute: vi.fn(),
    })),
    continueTrace: vi.fn(() => ({ end: vi.fn() })),
    increment: vi.fn(),
    timing: vi.fn(),
    gauge: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }
}

function makeLogger() {
  return { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() }
}

function makeRepository() {
  return {
    batchWrite: vi.fn().mockResolvedValue(undefined),
  }
}

function makeRiskEvent(overrides?: Partial<RiskEvent>): RiskEvent {
  return {
    event_id: 'evt-001',
    trace_id: 'trace-abc-123',
    asset_id: 'R-17',
    timestamp: '2026-03-10T12:00:00.000Z',
    composite_risk: 0.72,
    risk_state: 'elevated',
    z_scores: {
      position_error_z: 2.5,
      accel_z: 0.4,
      gyro_z: 0.6,
      temperature_z: 0.8,
    },
    threshold_breach: 0.5,
    contributing_signals: ['joint_position_error_deg'],
    last_values: {
      board_temperature_c: 47.3,
      accel_magnitude_ms2: 1.2,
      gyro_magnitude_rads: 0.31,
      joint_position_error_deg: 0.15,
      control_loop_freq_hz: 100,
    },
    ...overrides,
  }
}

function makeKinesisEvent(riskEvents: RiskEvent[]) {
  return {
    Records: riskEvents.map((evt, i) => ({
      kinesis: {
        data: Buffer.from(JSON.stringify(evt)).toString('base64'),
        partitionKey: evt.asset_id,
        sequenceNumber: `seq-${i}`,
        approximateArrivalTimestamp: Date.now() / 1000,
      },
      eventSource: 'aws:kinesis',
      eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-risk-events',
    })),
  }
}

const ctx: HandlerContext = { requestId: 'req-1', functionName: 'history-projector' }
const config: HistoryProjectorConfig = {
  serviceName: 'history-projector',
  ttlHours: 24,
}

describe('HistoryProjectorHandler', () => {
  let handler: HistoryProjectorHandler
  let repository: ReturnType<typeof makeRepository>
  let telemetry: ReturnType<typeof makeTelemetry>
  let logger: ReturnType<typeof makeLogger>

  beforeEach(() => {
    telemetry = makeTelemetry()
    logger = makeLogger()
    repository = makeRepository()
    handler = new HistoryProjectorHandler(
      config,
      telemetry as never,
      logger as never,
      repository as never
    )
  })

  it('projects a single RiskEvent into a history row', async () => {
    const event = makeKinesisEvent([makeRiskEvent()])

    await handler.handle(event, ctx)

    expect(repository.batchWrite).toHaveBeenCalledTimes(1)
    const rows: HistoryRow[] = repository.batchWrite.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0].asset_id).toBe('R-17')
    expect(rows[0].composite_risk).toBe(0.72)
    expect(rows[0].risk_state).toBe('elevated')
    expect(rows[0].threshold_breach).toBe(0.5)
    expect(rows[0].contributing_signals).toEqual(['joint_position_error_deg'])
  })

  it('preserves z_scores fields', async () => {
    const event = makeKinesisEvent([makeRiskEvent()])

    await handler.handle(event, ctx)

    const rows: HistoryRow[] = repository.batchWrite.mock.calls[0][0]
    expect(rows[0].z_scores).toEqual({
      position_error_z: 2.5,
      accel_z: 0.4,
      gyro_z: 0.6,
      temperature_z: 0.8,
    })
  })

  it('preserves last_values fields', async () => {
    const event = makeKinesisEvent([makeRiskEvent()])

    await handler.handle(event, ctx)

    const rows: HistoryRow[] = repository.batchWrite.mock.calls[0][0]
    expect(rows[0].last_values).toEqual({
      board_temperature_c: 47.3,
      accel_magnitude_ms2: 1.2,
      gyro_magnitude_rads: 0.31,
      joint_position_error_deg: 0.15,
      control_loop_freq_hz: 100,
    })
  })

  it('sets expires_at based on TTL_HOURS', async () => {
    const event = makeKinesisEvent([makeRiskEvent()])
    const beforeWrite = Math.floor(Date.now() / 1000)

    await handler.handle(event, ctx)

    const rows: HistoryRow[] = repository.batchWrite.mock.calls[0][0]
    const expectedMin = beforeWrite + 24 * 3600
    const expectedMax = expectedMin + 5 // allow 5s tolerance
    expect(rows[0].expires_at).toBeGreaterThanOrEqual(expectedMin)
    expect(rows[0].expires_at).toBeLessThanOrEqual(expectedMax)
  })

  it('processes a batch of multiple RiskEvents', async () => {
    const events = [
      makeRiskEvent({ asset_id: 'R-17', composite_risk: 0.72 }),
      makeRiskEvent({ asset_id: 'R-8', composite_risk: 0.15, risk_state: 'nominal' }),
      makeRiskEvent({ asset_id: 'R-50', composite_risk: 0.92, risk_state: 'critical' }),
    ]
    const event = makeKinesisEvent(events)

    await handler.handle(event, ctx)

    const rows: HistoryRow[] = repository.batchWrite.mock.calls[0][0]
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.asset_id)).toEqual(['R-17', 'R-8', 'R-50'])
  })

  it('skips empty batches', async () => {
    const event = makeKinesisEvent([])

    await handler.handle(event, ctx)

    expect(repository.batchWrite).not.toHaveBeenCalled()
  })

  it('records OTel metrics for batch writes', async () => {
    const event = makeKinesisEvent([makeRiskEvent(), makeRiskEvent({ asset_id: 'R-8' })])

    await handler.handle(event, ctx)

    expect(telemetry.timing).toHaveBeenCalledWith(
      'history_projector.dynamodb_latency_ms',
      expect.any(Number)
    )
    expect(telemetry.gauge).toHaveBeenCalledWith('history_projector.batch_size', 2)
  })

  it('logs projected row count and asset IDs', async () => {
    const event = makeKinesisEvent([
      makeRiskEvent({ asset_id: 'R-17' }),
      makeRiskEvent({ asset_id: 'R-8' }),
    ])

    await handler.handle(event, ctx)

    expect(logger.log).toHaveBeenCalledWith('Projected history rows', {
      count: 2,
      assets: ['R-17', 'R-8'],
    })
  })

  it('uses correct TTL with custom config', async () => {
    const customConfig: HistoryProjectorConfig = { serviceName: 'hp', ttlHours: 168 }
    const customHandler = new HistoryProjectorHandler(
      customConfig,
      telemetry as never,
      logger as never,
      repository as never
    )
    const event = makeKinesisEvent([makeRiskEvent()])
    const beforeWrite = Math.floor(Date.now() / 1000)

    await customHandler.handle(event, ctx)

    const rows: HistoryRow[] = repository.batchWrite.mock.calls[0][0]
    const expectedMin = beforeWrite + 168 * 3600
    expect(rows[0].expires_at).toBeGreaterThanOrEqual(expectedMin)
  })

  it('preserves timestamp from RiskEvent (not wall clock)', async () => {
    const event = makeKinesisEvent([makeRiskEvent({ timestamp: '2026-03-10T12:00:00.500Z' })])

    await handler.handle(event, ctx)

    const rows: HistoryRow[] = repository.batchWrite.mock.calls[0][0]
    expect(rows[0].timestamp).toBe('2026-03-10T12:00:00.500Z')
  })
})
