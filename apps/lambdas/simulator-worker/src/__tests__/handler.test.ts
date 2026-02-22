import type { SimulatorWorkerPayload } from '@streaming-agents/core-contracts'
import type { HandlerContext } from '@streaming-agents/lambda-base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSequence } from '../event-builder.js'
import { SimulatorWorkerHandler, type WorkerConfig } from '../worker.handler.js'

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({ end: vi.fn(), setStatus: vi.fn(), recordException: vi.fn() })),
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
    putRecords: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0 }),
  }
}

const ctx: HandlerContext = { requestId: 'req-1', functionName: 'sim-worker' }
const config: WorkerConfig = { serviceName: 'simulator-worker', kinesisStreamName: 'r17-telemetry' }

describe('SimulatorWorkerHandler', () => {
  let handler: SimulatorWorkerHandler
  let producer: ReturnType<typeof makeProducer>
  let telemetry: ReturnType<typeof makeTelemetry>

  beforeEach(() => {
    telemetry = makeTelemetry()
    producer = makeProducer()
    resetSequence()
    handler = new SimulatorWorkerHandler(
      config,
      telemetry as never,
      makeLogger() as never,
      producer as never
    )
  })

  it('generates burst_count events and publishes to Kinesis', async () => {
    const payload: SimulatorWorkerPayload = {
      asset_id: 'R-1',
      scenario: 'healthy',
      seed: 'test-seed',
      burst_count: 10,
    }

    await handler.handle(payload, ctx)

    expect(producer.putRecords).toHaveBeenCalledTimes(1)
    const records = producer.putRecords.mock.calls[0][0]
    expect(records).toHaveLength(10)
  })

  it('uses asset_id as partition key for all records', async () => {
    const payload: SimulatorWorkerPayload = {
      asset_id: 'R-17',
      scenario: 'healthy',
      seed: 'pk-test',
      burst_count: 5,
    }

    await handler.handle(payload, ctx)

    const records = producer.putRecords.mock.calls[0][0]
    for (const r of records) {
      expect(r.partitionKey).toBe('R-17')
    }
  })

  it('records OTel span for generation', async () => {
    const payload: SimulatorWorkerPayload = {
      asset_id: 'R-5',
      scenario: 'joint_3_degradation',
      seed: 'otel-test',
      burst_count: 5,
    }

    await handler.handle(payload, ctx)

    expect(telemetry.startSpan).toHaveBeenCalledWith(
      'simulator.worker.generate',
      expect.objectContaining({
        'simulator.asset_id': 'R-5',
        'simulator.scenario': 'joint_3_degradation',
      })
    )
  })

  it('increments events_produced metric', async () => {
    const payload: SimulatorWorkerPayload = {
      asset_id: 'R-1',
      scenario: 'thermal_runaway',
      seed: 'metric-test',
      burst_count: 5,
    }

    await handler.handle(payload, ctx)

    expect(telemetry.increment).toHaveBeenCalledWith(
      'simulator.worker.events_produced',
      expect.objectContaining({ scenario: 'thermal_runaway' })
    )
  })

  it('records kinesis_put_latency_ms timing', async () => {
    const payload: SimulatorWorkerPayload = {
      asset_id: 'R-1',
      scenario: 'healthy',
      seed: 'timing-test',
      burst_count: 5,
    }

    await handler.handle(payload, ctx)

    expect(telemetry.timing).toHaveBeenCalledWith(
      'simulator.worker.kinesis_put_latency_ms',
      expect.any(Number)
    )
  })

  it('produces deterministic output for same payload', async () => {
    const payload: SimulatorWorkerPayload = {
      asset_id: 'R-1',
      scenario: 'healthy',
      seed: 'deterministic-test',
      burst_count: 5,
    }

    await handler.handle(payload, ctx)
    const records1 = producer.putRecords.mock.calls[0][0].map((r: { data: unknown }) => r.data)

    // Reset and run again
    resetSequence()
    producer.putRecords.mockClear()
    handler = new SimulatorWorkerHandler(
      config,
      telemetry as never,
      makeLogger() as never,
      producer as never
    )

    await handler.handle(payload, ctx)
    const records2 = producer.putRecords.mock.calls[0][0].map((r: { data: unknown }) => r.data)

    // Timestamps will differ (based on Date.now()), so compare signal values
    for (let i = 0; i < records1.length; i++) {
      const e1 = records1[i] as Record<string, unknown>
      const e2 = records2[i] as Record<string, unknown>
      expect(e1.board_temperature_c).toBe(e2.board_temperature_c)
      expect(e1.accel_magnitude_ms2).toBe(e2.accel_magnitude_ms2)
      expect(e1.joint_position_error_deg).toBe(e2.joint_position_error_deg)
    }
  })
})
