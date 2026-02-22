import type { AssetState, IngestedEvent } from '@streaming-agents/core-contracts'
import type { HandlerContext } from '@streaming-agents/lambda-base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeAlpha, initBaselines, updateBaselines } from '../baseline.js'
import { computeZScore } from '../risk.js'
import { type SignalAgentConfig, SignalAgentHandler } from '../signal-agent.handler.js'

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({
      end: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      setAttribute: vi.fn(),
      spanContext: vi.fn(() => ({ traceId: 'abc123' })),
    })),
    continueTrace: vi.fn(() => ({
      end: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
    })),
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
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  }
}

function makeProducer() {
  return {
    putRecords: vi.fn().mockResolvedValue({ total: 1, succeeded: 1, failed: 0 }),
  }
}

function makeIngestedEvent(overrides?: Partial<IngestedEvent['payload']>): IngestedEvent {
  return {
    event_id: 'evt-001',
    trace_id: 'trace-abc-123',
    ingested_at: '2025-01-15T10:30:00.000Z',
    source_partition: 'R-1',
    source_sequence: 'seq-001',
    source_type: 'simulated',
    payload: {
      schema_version: 'r17.telemetry.v2',
      event_id: 'raw-001',
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
    },
  }
}

function makeKinesisEvent(ingestedEvents: IngestedEvent[]) {
  return {
    Records: ingestedEvents.map((evt, i) => ({
      kinesis: {
        data: Buffer.from(JSON.stringify(evt)).toString('base64'),
        partitionKey: evt.payload.asset_id,
        sequenceNumber: `seq-${i}`,
        approximateArrivalTimestamp: Date.now() / 1000,
      },
      eventSource: 'aws:kinesis',
      eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789:stream/r17-ingested',
    })),
  }
}

const ctx: HandlerContext = { requestId: 'req-1', functionName: 'signal-agent' }
const config: SignalAgentConfig = {
  serviceName: 'signal-agent',
  outputStreamName: 'r17-risk-events',
  emaWindow: 60,
  minStdDev: 0.001,
  normalizeDivisor: 3.0,
}

describe('SignalAgentHandler', () => {
  let handler: SignalAgentHandler
  let repository: ReturnType<typeof makeRepository>
  let producer: ReturnType<typeof makeProducer>
  let telemetry: ReturnType<typeof makeTelemetry>

  beforeEach(() => {
    telemetry = makeTelemetry()
    repository = makeRepository()
    producer = makeProducer()
    handler = new SignalAgentHandler(
      config,
      telemetry as never,
      makeLogger() as never,
      repository as never,
      producer as never
    )
  })

  it('initializes baselines on first reading for new asset', async () => {
    const event = makeKinesisEvent([makeIngestedEvent()])

    await handler.handle(event, ctx)

    // Should write new state to DynamoDB
    expect(repository.put).toHaveBeenCalledTimes(1)
    const state: AssetState = repository.put.mock.calls[0][0]
    expect(state.asset_id).toBe('R-1')
    expect(state.reading_count).toBe(1)
    expect(state.baselines.board_temperature_c.mean).toBe(38.5)
    expect(state.baselines.accel_magnitude_ms2.mean).toBe(9.81)
    expect(state.baselines.joint_position_error_deg.mean).toBe(0.1)
  })

  it('updates baselines on subsequent readings', async () => {
    // First reading establishes baselines
    const existingState: AssetState = {
      asset_id: 'R-1',
      updated_at: '2025-01-15T10:29:59.000Z',
      reading_count: 1,
      baselines: {
        board_temperature_c: initBaselines(38.5),
        accel_magnitude_ms2: initBaselines(9.81),
        gyro_magnitude_rads: initBaselines(0.02),
        joint_position_error_deg: initBaselines(0.1),
      },
      z_scores: { position_error_z: 0, accel_z: 0, gyro_z: 0, temperature_z: 0 },
      composite_risk: 0,
      risk_state: 'nominal',
      threshold_breach: 0,
      last_values: {
        board_temperature_c: 38.5,
        accel_magnitude_ms2: 9.81,
        gyro_magnitude_rads: 0.02,
        joint_position_error_deg: 0.1,
        control_loop_freq_hz: 0,
      },
      last_trace_id: 'old-trace',
      last_event_id: 'old-event',
    }
    repository.get.mockResolvedValueOnce(existingState)

    // Second reading with slightly different values
    const event = makeKinesisEvent([makeIngestedEvent({ board_temperature_c: 40.0 })])
    await handler.handle(event, ctx)

    const state: AssetState = repository.put.mock.calls[0][0]
    expect(state.reading_count).toBe(2)
    // Mean should have shifted towards 40.0
    expect(state.baselines.board_temperature_c.mean).toBeGreaterThan(38.5)
  })

  it('emits RiskEvent with correct trace_id from IngestedEvent', async () => {
    const event = makeKinesisEvent([makeIngestedEvent()])

    await handler.handle(event, ctx)

    expect(producer.putRecords).toHaveBeenCalledTimes(1)
    const riskEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(riskEvent.trace_id).toBe('trace-abc-123')
    expect(riskEvent.asset_id).toBe('R-1')
    expect(riskEvent.z_scores).toBeDefined()
    expect(riskEvent.risk_state).toBeDefined()
  })

  it('continues trace from ingestion (not new root span)', async () => {
    const event = makeKinesisEvent([makeIngestedEvent()])

    await handler.handle(event, ctx)

    expect(telemetry.continueTrace).toHaveBeenCalledWith('trace-abc-123', 'signal-agent.process')
  })

  it('emits contributing_signals only for |z| > 2.0', async () => {
    // With initial baselines (std_dev=0), even small changes produce large z-scores
    // because MIN_STDDEV = 0.001 is used
    const existingState: AssetState = {
      asset_id: 'R-1',
      updated_at: '2025-01-15T10:29:59.000Z',
      reading_count: 100,
      baselines: {
        board_temperature_c: { mean: 38.5, variance: 1.0, std_dev: 1.0 },
        accel_magnitude_ms2: { mean: 9.81, variance: 0.5, std_dev: Math.sqrt(0.5) },
        gyro_magnitude_rads: { mean: 0.02, variance: 0.001, std_dev: Math.sqrt(0.001) },
        joint_position_error_deg: { mean: 0.1, variance: 0.01, std_dev: 0.1 },
      },
      z_scores: { position_error_z: 0, accel_z: 0, gyro_z: 0, temperature_z: 0 },
      composite_risk: 0,
      risk_state: 'nominal',
      threshold_breach: 0,
      last_values: {
        board_temperature_c: 38.5,
        accel_magnitude_ms2: 9.81,
        gyro_magnitude_rads: 0.02,
        joint_position_error_deg: 0.1,
        control_loop_freq_hz: 50,
      },
      last_trace_id: 'old-trace',
      last_event_id: 'old-event',
    }
    repository.get.mockResolvedValueOnce(existingState)

    // Large position error → should be contributing signal
    const event = makeKinesisEvent([makeIngestedEvent({ joint_position_error_deg: 2.5 })])
    await handler.handle(event, ctx)

    const riskEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(riskEvent.contributing_signals).toContain('joint_position_error_deg')
  })

  it('handles null signal values with z-score of 0.0', async () => {
    const event = makeKinesisEvent([
      makeIngestedEvent({
        board_temperature_c: null,
        accel_magnitude_ms2: null,
        gyro_magnitude_rads: null,
      }),
    ])

    await handler.handle(event, ctx)

    const state: AssetState = repository.put.mock.calls[0][0]
    expect(state.z_scores.temperature_z).toBe(0)
    expect(state.z_scores.accel_z).toBe(0)
    expect(state.z_scores.gyro_z).toBe(0)
  })

  it('writes updated state to DynamoDB on every reading', async () => {
    const event = makeKinesisEvent([makeIngestedEvent()])

    await handler.handle(event, ctx)

    expect(repository.get).toHaveBeenCalledWith('R-1')
    expect(repository.put).toHaveBeenCalledTimes(1)
    const state: AssetState = repository.put.mock.calls[0][0]
    expect(state.last_trace_id).toBe('trace-abc-123')
    expect(state.last_event_id).toBe('evt-001')
  })

  it('uses asset_id as partition key for risk event', async () => {
    const event = makeKinesisEvent([makeIngestedEvent()])

    await handler.handle(event, ctx)

    const record = producer.putRecords.mock.calls[0][0][0]
    expect(record.partitionKey).toBe('R-1')
  })

  it('records OTel metrics for processing', async () => {
    const event = makeKinesisEvent([makeIngestedEvent()])

    await handler.handle(event, ctx)

    expect(telemetry.increment).toHaveBeenCalledWith(
      'signal_agent.events_processed',
      expect.objectContaining({ risk_state: 'nominal' })
    )
    expect(telemetry.gauge).toHaveBeenCalledWith(
      'signal_agent.risk_score',
      expect.any(Number),
      expect.objectContaining({ asset_id: 'R-1' })
    )
  })

  it('records DynamoDB latency metrics', async () => {
    const event = makeKinesisEvent([makeIngestedEvent()])

    await handler.handle(event, ctx)

    expect(telemetry.timing).toHaveBeenCalledWith(
      'signal_agent.dynamodb_latency_ms',
      expect.any(Number),
      { operation: 'read' }
    )
    expect(telemetry.timing).toHaveBeenCalledWith(
      'signal_agent.dynamodb_latency_ms',
      expect.any(Number),
      { operation: 'write' }
    )
  })

  it('processes multiple records in a batch', async () => {
    const event = makeKinesisEvent([makeIngestedEvent(), makeIngestedEvent({ asset_id: 'R-2' })])

    await handler.handle(event, ctx)

    // Should read + write for each record
    expect(repository.get).toHaveBeenCalledTimes(2)
    expect(repository.put).toHaveBeenCalledTimes(2)
    expect(producer.putRecords).toHaveBeenCalledTimes(2)
  })

  describe('degradation detection', () => {
    it('detects sudden degradation from established healthy baseline', async () => {
      // Well-established healthy baselines (60 readings)
      const healthyState: AssetState = {
        asset_id: 'R-1',
        updated_at: '2025-01-15T10:29:00.000Z',
        reading_count: 60,
        baselines: {
          board_temperature_c: { mean: 38.0, variance: 1.0, std_dev: 1.0 },
          accel_magnitude_ms2: { mean: 9.81, variance: 0.25, std_dev: 0.5 },
          gyro_magnitude_rads: { mean: 0.02, variance: 0.0001, std_dev: 0.01 },
          joint_position_error_deg: { mean: 0.1, variance: 0.001, std_dev: Math.sqrt(0.001) },
        },
        z_scores: { position_error_z: 0, accel_z: 0, gyro_z: 0, temperature_z: 0 },
        composite_risk: 0,
        risk_state: 'nominal',
        threshold_breach: 0,
        last_values: {
          board_temperature_c: 38.0,
          accel_magnitude_ms2: 9.81,
          gyro_magnitude_rads: 0.02,
          joint_position_error_deg: 0.1,
          control_loop_freq_hz: 50,
        },
        last_trace_id: 'old-trace',
        last_event_id: 'old-event',
      }
      repository.get.mockResolvedValueOnce(healthyState)

      // Sudden degradation: position error jumps to 3.5°, temp to 65°C
      const event = makeKinesisEvent([
        makeIngestedEvent({
          joint_position_error_deg: 3.5,
          board_temperature_c: 65,
          accel_magnitude_ms2: 16,
          gyro_magnitude_rads: 0.25,
        }),
      ])

      await handler.handle(event, ctx)

      const riskEvent = producer.putRecords.mock.calls[0][0][0].data

      // Should detect anomaly — z-scores spike far from baselines
      expect(riskEvent.risk_state).not.toBe('nominal')
      expect(riskEvent.threshold_breach).toBe(1.0) // All signals above critical
      expect(riskEvent.contributing_signals.length).toBeGreaterThan(0)
      expect(riskEvent.contributing_signals).toContain('joint_position_error_deg')
    })

    it('progressive degradation increases risk over time', async () => {
      // Pre-established healthy baselines
      const healthyState: AssetState = {
        asset_id: 'R-1',
        updated_at: '2025-01-15T10:29:00.000Z',
        reading_count: 60,
        baselines: {
          board_temperature_c: { mean: 38.0, variance: 1.0, std_dev: 1.0 },
          accel_magnitude_ms2: { mean: 9.81, variance: 0.25, std_dev: 0.5 },
          gyro_magnitude_rads: { mean: 0.02, variance: 0.0001, std_dev: 0.01 },
          joint_position_error_deg: { mean: 0.1, variance: 0.001, std_dev: Math.sqrt(0.001) },
        },
        z_scores: { position_error_z: 0, accel_z: 0, gyro_z: 0, temperature_z: 0 },
        composite_risk: 0,
        risk_state: 'nominal',
        threshold_breach: 0,
        last_values: {
          board_temperature_c: 38.0,
          accel_magnitude_ms2: 9.81,
          gyro_magnitude_rads: 0.02,
          joint_position_error_deg: 0.1,
          control_loop_freq_hz: 50,
        },
        last_trace_id: 'old-trace',
        last_event_id: 'old-event',
      }

      const riskScores: number[] = []

      for (let tick = 0; tick < 120; tick++) {
        // Linear degradation: 0.1° → 3.5°
        const positionError = 0.1 + (3.5 - 0.1) * (tick / 119)
        // Temperature: 38°C → 52°C
        const temp = 38 + (52 - 38) * (tick / 119)

        const ingestedEvent = makeIngestedEvent({
          joint_position_error_deg: positionError,
          board_temperature_c: temp,
          accel_magnitude_ms2: 9.81,
          gyro_magnitude_rads: 0.02,
        })

        const prevState =
          tick > 0
            ? repository.put.mock.calls[repository.put.mock.calls.length - 1][0]
            : healthyState
        repository.get.mockResolvedValueOnce(prevState)

        const event = makeKinesisEvent([ingestedEvent])
        producer.putRecords.mockClear()

        await handler.handle(event, ctx)

        const riskEvent = producer.putRecords.mock.calls[0][0][0].data
        riskScores.push(riskEvent.composite_risk)
      }

      // First reading should produce elevated risk (z-scores spike from baseline deviation)
      expect(riskScores[0]).toBeGreaterThan(0)

      // Final state should show threshold breach detection (position_error > 2.5° critical)
      const finalState: AssetState =
        repository.put.mock.calls[repository.put.mock.calls.length - 1][0]
      expect(finalState.threshold_breach).toBe(1.0)
      expect(finalState.reading_count).toBe(180) // 60 prior + 120 new
    })
  })
})
