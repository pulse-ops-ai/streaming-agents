import type { RiskEvent } from '@streaming-agents/core-contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BedrockAdapter } from '../adapters/bedrock.adapter.js'
import type { AssetStateRepository } from '../adapters/dynamodb.adapter.js'
import { type DiagnosisAgentConfig, DiagnosisAgentHandler } from '../diagnosis-agent.handler.js'

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
      setAttribute: vi.fn(),
      spanContext: vi.fn(() => ({ traceId: 'abc123' })),
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

function makeConfig(overrides?: Partial<DiagnosisAgentConfig>): DiagnosisAgentConfig {
  return {
    serviceName: 'diagnosis-agent',
    outputStreamName: 'r17-diagnosis',
    bedrockModelId: 'anthropic.claude-sonnet-4-20250514',
    debounceMs: 30000,
    ...overrides,
  }
}

function makeRiskEvent(overrides?: Partial<RiskEvent>): RiskEvent {
  return {
    event_id: 'evt-1',
    trace_id: 'trace-abc',
    asset_id: 'robot-17',
    timestamp: '2025-01-01T00:00:00Z',
    composite_risk: 0.72,
    risk_state: 'elevated',
    z_scores: {
      position_error_z: 2.8,
      accel_z: 0.5,
      gyro_z: 0.3,
      temperature_z: 1.1,
    },
    threshold_breach: 0.5,
    contributing_signals: ['joint_position_error_deg'],
    last_values: {
      board_temperature_c: 52.3,
      accel_magnitude_ms2: 1.2,
      gyro_magnitude_rads: 0.4,
      joint_position_error_deg: 3.5,
      control_loop_freq_hz: 100,
    },
    ...overrides,
  }
}

function makeKinesisEvent(riskEvent: RiskEvent) {
  return {
    Records: [
      {
        kinesis: {
          data: Buffer.from(JSON.stringify(riskEvent)).toString('base64'),
          partitionKey: riskEvent.asset_id,
          sequenceNumber: '1000',
          approximateArrivalTimestamp: Date.now(),
        },
        eventSource: 'aws:kinesis',
        eventSourceARN: 'arn:aws:kinesis:us-east-1:000:stream/r17-risk-events',
      },
    ],
  }
}

const validBedrockResponse = JSON.stringify({
  root_cause: 'Joint bearing wear causing increased position error',
  evidence: [
    {
      signal: 'joint_position_error_deg',
      observation: 'Position error exceeds 2.5 standard deviations',
      z_score: 2.8,
    },
  ],
  confidence: 'high',
  recommended_actions: ['reduce joint velocity', 'inspect servo motor'],
  severity: 'warning',
})

describe('DiagnosisAgentHandler', () => {
  let handler: DiagnosisAgentHandler
  let telemetry: ReturnType<typeof makeTelemetry>
  let logger: ReturnType<typeof makeLogger>
  let repository: {
    get: ReturnType<typeof vi.fn>
    updateDiagnosisTimestamp: ReturnType<typeof vi.fn>
  }
  let producer: { putRecords: ReturnType<typeof vi.fn> }
  let bedrock: { invokeModel: ReturnType<typeof vi.fn> }
  let dlq: {
    sendToDLQ: ReturnType<typeof vi.fn>
    buildDLQMessage: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    telemetry = makeTelemetry()
    logger = makeLogger()
    repository = {
      get: vi.fn().mockResolvedValue(null),
      updateDiagnosisTimestamp: vi.fn().mockResolvedValue(undefined),
    }
    producer = {
      putRecords: vi.fn().mockResolvedValue({ total: 1, succeeded: 1, failed: 0 }),
    }
    bedrock = {
      invokeModel: vi.fn().mockResolvedValue({
        text: validBedrockResponse,
        promptTokens: 500,
        completionTokens: 200,
      }),
    }
    dlq = {
      sendToDLQ: vi.fn().mockResolvedValue(undefined),
      buildDLQMessage: vi.fn((opts: Record<string, unknown>) => ({
        error_code: opts.errorCode,
        error_message: opts.errorMessage,
        original_record: opts.originalRecord,
        source_stream: opts.sourceStream,
        source_partition: opts.sourcePartition,
        source_sequence: opts.sourceSequence,
        failed_at: new Date().toISOString(),
        service: opts.service,
      })),
    }

    handler = new DiagnosisAgentHandler(
      makeConfig(),
      telemetry as never,
      logger as never,
      repository as unknown as AssetStateRepository,
      producer as never,
      bedrock as unknown as BedrockAdapter,
      dlq as never
    )
  })

  it('skips nominal risk — no Bedrock call', async () => {
    const event = makeKinesisEvent(makeRiskEvent({ risk_state: 'nominal' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(bedrock.invokeModel).not.toHaveBeenCalled()
    expect(producer.putRecords).not.toHaveBeenCalled()
    expect(telemetry.increment).toHaveBeenCalledWith('diagnosis_agent.events_skipped', {
      reason: 'nominal',
    })
  })

  it('calls Bedrock and emits DiagnosisEvent for elevated risk with no previous diagnosis', async () => {
    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(bedrock.invokeModel).toHaveBeenCalledOnce()
    expect(producer.putRecords).toHaveBeenCalledOnce()

    const emittedRecords = producer.putRecords.mock.calls[0][0]
    expect(emittedRecords).toHaveLength(1)
    expect(emittedRecords[0].partitionKey).toBe('robot-17')

    const diagnosisEvent = emittedRecords[0].data
    expect(diagnosisEvent.asset_id).toBe('robot-17')
    expect(diagnosisEvent.root_cause).toBe('Joint bearing wear causing increased position error')
    expect(diagnosisEvent.severity).toBe('warning')
    expect(diagnosisEvent.confidence).toBe('high')
    expect(diagnosisEvent.model_id).toBe('anthropic.claude-sonnet-4-20250514')
  })

  it('calls Bedrock for critical risk and preserves severity from LLM', async () => {
    bedrock.invokeModel.mockResolvedValueOnce({
      text: JSON.stringify({
        root_cause: 'Thermal runaway in actuator',
        evidence: [
          {
            signal: 'board_temperature_c',
            observation: 'Temperature spike',
            z_score: 3.5,
          },
        ],
        confidence: 'high',
        recommended_actions: ['emergency shutdown'],
        severity: 'critical',
      }),
      promptTokens: 600,
      completionTokens: 250,
    })

    const event = makeKinesisEvent(makeRiskEvent({ risk_state: 'critical', composite_risk: 0.88 }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(bedrock.invokeModel).toHaveBeenCalledOnce()
    const diagnosisEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(diagnosisEvent.severity).toBe('critical')
    expect(diagnosisEvent.composite_risk).toBe(0.88)
  })

  it('skips when within debounce window', async () => {
    const recentTime = new Date(Date.now() - 5000).toISOString() // 5s ago
    repository.get.mockResolvedValue({ last_diagnosis_at: recentTime })

    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(bedrock.invokeModel).not.toHaveBeenCalled()
    expect(producer.putRecords).not.toHaveBeenCalled()
    expect(telemetry.increment).toHaveBeenCalledWith('diagnosis_agent.events_skipped', {
      reason: 'debounce',
    })
  })

  it('proceeds when debounce window has elapsed', async () => {
    const oldTime = new Date(Date.now() - 60000).toISOString() // 60s ago
    repository.get.mockResolvedValue({ last_diagnosis_at: oldTime })

    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(bedrock.invokeModel).toHaveBeenCalledOnce()
    expect(producer.putRecords).toHaveBeenCalledOnce()
  })

  it('sends to DLQ when Bedrock returns malformed JSON', async () => {
    bedrock.invokeModel.mockResolvedValueOnce({
      text: 'I cannot analyze this data properly.',
      promptTokens: 500,
      completionTokens: 50,
    })

    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(dlq.buildDLQMessage).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'BEDROCK_PARSE_FAILED' })
    )
    expect(dlq.sendToDLQ).toHaveBeenCalledOnce()
    expect(producer.putRecords).not.toHaveBeenCalled()
  })

  it('sends to DLQ when Bedrock invocation fails', async () => {
    bedrock.invokeModel.mockRejectedValueOnce(new Error('Bedrock timeout'))

    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(dlq.buildDLQMessage).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'BEDROCK_INVOKE_FAILED' })
    )
    expect(dlq.sendToDLQ).toHaveBeenCalledOnce()
    expect(producer.putRecords).not.toHaveBeenCalled()
  })

  it('propagates trace_id from RiskEvent to DiagnosisEvent', async () => {
    const event = makeKinesisEvent(makeRiskEvent({ trace_id: 'trace-xyz-123' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    const diagnosisEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(diagnosisEvent.trace_id).toBe('trace-xyz-123')
  })

  it('captures token counts from Bedrock response', async () => {
    bedrock.invokeModel.mockResolvedValueOnce({
      text: validBedrockResponse,
      promptTokens: 750,
      completionTokens: 300,
    })

    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    const diagnosisEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(diagnosisEvent.prompt_tokens).toBe(750)
    expect(diagnosisEvent.completion_tokens).toBe(300)
  })

  it('updates debounce timestamp after successful diagnosis', async () => {
    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(repository.updateDiagnosisTimestamp).toHaveBeenCalledWith('robot-17', expect.any(String))
  })

  it('continues trace from RiskEvent', async () => {
    const event = makeKinesisEvent(makeRiskEvent({ trace_id: 'trace-abc' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(telemetry.continueTrace).toHaveBeenCalledWith('trace-abc', 'diagnosis-agent.process')
  })

  it('records bedrock latency metric', async () => {
    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(telemetry.timing).toHaveBeenCalledWith(
      'diagnosis_agent.bedrock_latency_ms',
      expect.any(Number)
    )
  })

  it('does not update debounce when Bedrock fails', async () => {
    bedrock.invokeModel.mockRejectedValueOnce(new Error('Bedrock timeout'))

    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(repository.updateDiagnosisTimestamp).not.toHaveBeenCalled()
  })

  it('does not update debounce when parse fails', async () => {
    bedrock.invokeModel.mockResolvedValueOnce({
      text: 'garbage',
      promptTokens: 100,
      completionTokens: 10,
    })

    const event = makeKinesisEvent(makeRiskEvent())
    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(repository.updateDiagnosisTimestamp).not.toHaveBeenCalled()
  })

  it('processes multiple records in a single batch', async () => {
    const risk1 = makeRiskEvent({ asset_id: 'robot-1' })
    const risk2 = makeRiskEvent({ asset_id: 'robot-2' })
    const event = {
      Records: [
        {
          kinesis: {
            data: Buffer.from(JSON.stringify(risk1)).toString('base64'),
            partitionKey: 'robot-1',
            sequenceNumber: '1000',
            approximateArrivalTimestamp: Date.now(),
          },
          eventSource: 'aws:kinesis',
          eventSourceARN: 'arn:aws:kinesis:us-east-1:000:stream/r17-risk-events',
        },
        {
          kinesis: {
            data: Buffer.from(JSON.stringify(risk2)).toString('base64'),
            partitionKey: 'robot-2',
            sequenceNumber: '1001',
            approximateArrivalTimestamp: Date.now(),
          },
          eventSource: 'aws:kinesis',
          eventSourceARN: 'arn:aws:kinesis:us-east-1:000:stream/r17-risk-events',
        },
      ],
    }

    await handler.handle(event, { requestId: 'req-1', functionName: 'diagnosis-agent' })

    expect(bedrock.invokeModel).toHaveBeenCalledTimes(2)
    expect(producer.putRecords).toHaveBeenCalledTimes(2)
  })
})
