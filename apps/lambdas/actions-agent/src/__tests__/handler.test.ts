import type { DiagnosisEvent, IncidentRecord } from '@streaming-agents/core-contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ActionsAgentConfig, ActionsAgentHandler } from '../actions-agent.handler.js'
import type { IncidentAdapter } from '../adapters/dynamodb.adapter.js'

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

function makeConfig(overrides?: Partial<ActionsAgentConfig>): ActionsAgentConfig {
  return {
    serviceName: 'actions-agent',
    outputStreamName: 'r17-actions',
    escalationThresholdMs: 60000,
    resolvedTtlHours: 72,
    ...overrides,
  }
}

function makeDiagnosis(overrides?: Partial<DiagnosisEvent>): DiagnosisEvent {
  return {
    event_id: 'diag-1',
    trace_id: 'trace-abc',
    asset_id: 'robot-17',
    timestamp: '2025-01-01T00:00:30.000Z',
    risk_state: 'elevated',
    composite_risk: 0.65,
    root_cause: 'Joint bearing wear',
    evidence: [{ signal: 'joint_position_error_deg', observation: 'High error', z_score: 2.8 }],
    confidence: 'high',
    recommended_actions: ['reduce joint velocity'],
    severity: 'warning',
    model_id: 'anthropic.claude-sonnet-4-20250514',
    prompt_tokens: 500,
    completion_tokens: 200,
    ...overrides,
  }
}

function makeKinesisEvent(diagnosis: DiagnosisEvent) {
  return {
    Records: [
      {
        kinesis: {
          data: Buffer.from(JSON.stringify(diagnosis)).toString('base64'),
          partitionKey: diagnosis.asset_id,
          sequenceNumber: '1000',
          approximateArrivalTimestamp: Date.now(),
        },
        eventSource: 'aws:kinesis',
        eventSourceARN: 'arn:aws:kinesis:us-east-1:000:stream/r17-diagnosis',
      },
    ],
  }
}

function makeIncident(overrides?: Partial<IncidentRecord>): IncidentRecord {
  return {
    incident_id: 'inc-1',
    asset_id: 'robot-17',
    status: 'opened',
    opened_at: new Date(Date.now() - 30000).toISOString(),
    escalated_at: null,
    resolved_at: null,
    root_cause: 'Joint bearing wear',
    severity: 'warning',
    last_diagnosis_event_id: 'diag-0',
    last_action_event_id: 'act-0',
    action_history: [
      { action: 'alert', timestamp: new Date(Date.now() - 30000).toISOString(), event_id: 'act-0' },
    ],
    updated_at: new Date(Date.now() - 30000).toISOString(),
    expires_at: null,
    ...overrides,
  }
}

describe('ActionsAgentHandler', () => {
  let handler: ActionsAgentHandler
  let telemetry: ReturnType<typeof makeTelemetry>
  let logger: ReturnType<typeof makeLogger>
  let incidentAdapter: {
    findActiveIncident: ReturnType<typeof vi.fn>
    saveIncident: ReturnType<typeof vi.fn>
  }
  let producer: { putRecords: ReturnType<typeof vi.fn> }
  let dlq: {
    sendToDLQ: ReturnType<typeof vi.fn>
    buildDLQMessage: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    telemetry = makeTelemetry()
    logger = makeLogger()
    incidentAdapter = {
      findActiveIncident: vi.fn().mockResolvedValue(null),
      saveIncident: vi.fn().mockResolvedValue(undefined),
    }
    producer = {
      putRecords: vi.fn().mockResolvedValue({ total: 1, succeeded: 1, failed: 0 }),
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

    handler = new ActionsAgentHandler(
      makeConfig(),
      telemetry as never,
      logger as never,
      incidentAdapter as unknown as IncidentAdapter,
      producer as never,
      dlq as never
    )
  })

  it('warning + no incident → creates incident and emits alert ActionEvent', async () => {
    const event = makeKinesisEvent(makeDiagnosis())
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    // Incident created
    expect(incidentAdapter.saveIncident).toHaveBeenCalledOnce()
    const savedIncident = incidentAdapter.saveIncident.mock.calls[0][0] as IncidentRecord
    expect(savedIncident.status).toBe('opened')
    expect(savedIncident.asset_id).toBe('robot-17')

    // ActionEvent emitted
    expect(producer.putRecords).toHaveBeenCalledOnce()
    const actionEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(actionEvent.action).toBe('alert')
    expect(actionEvent.severity).toBe('warning')
    expect(actionEvent.incident_id).toBe(savedIncident.incident_id)
    expect(actionEvent.incident_status).toBe('opened')
  })

  it('warning + old incident → escalates and emits throttle', async () => {
    // Incident opened 90s ago
    const oldIncident = makeIncident({
      opened_at: new Date(Date.now() - 90000).toISOString(),
    })
    incidentAdapter.findActiveIncident.mockResolvedValue(oldIncident)

    const event = makeKinesisEvent(makeDiagnosis())
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    const savedIncident = incidentAdapter.saveIncident.mock.calls[0][0] as IncidentRecord
    expect(savedIncident.status).toBe('escalated')
    expect(savedIncident.incident_id).toBe('inc-1') // preserved

    const actionEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(actionEvent.action).toBe('throttle')
    expect(actionEvent.incident_status).toBe('escalated')
  })

  it('info + existing incident → resolves with TTL', async () => {
    incidentAdapter.findActiveIncident.mockResolvedValue(makeIncident())

    const event = makeKinesisEvent(makeDiagnosis({ severity: 'info' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    const savedIncident = incidentAdapter.saveIncident.mock.calls[0][0] as IncidentRecord
    expect(savedIncident.status).toBe('resolved')
    expect(savedIncident.resolved_at).toBeTruthy()
    expect(savedIncident.expires_at).toBeGreaterThan(0)

    const actionEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(actionEvent.action).toBe('resolve')
    expect(actionEvent.incident_status).toBe('resolved')
  })

  it('info + no incident → monitor, no incident write', async () => {
    const event = makeKinesisEvent(makeDiagnosis({ severity: 'info' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    expect(incidentAdapter.saveIncident).not.toHaveBeenCalled()

    const actionEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(actionEvent.action).toBe('monitor')
    expect(actionEvent.incident_id).toBeNull()
    expect(actionEvent.incident_status).toBeNull()
  })

  it('only one active incident per asset (deduplication)', async () => {
    // First: warning creates incident
    incidentAdapter.findActiveIncident.mockResolvedValue(null)
    const event1 = makeKinesisEvent(makeDiagnosis())
    await handler.handle(event1, { requestId: 'req-1', functionName: 'actions-agent' })

    const firstIncident = incidentAdapter.saveIncident.mock.calls[0][0] as IncidentRecord
    expect(firstIncident.status).toBe('opened')

    // Second: warning with existing incident → update, not create
    incidentAdapter.findActiveIncident.mockResolvedValue(firstIncident)
    const event2 = makeKinesisEvent(makeDiagnosis({ event_id: 'diag-2' }))
    await handler.handle(event2, { requestId: 'req-2', functionName: 'actions-agent' })

    const secondSaved = incidentAdapter.saveIncident.mock.calls[1][0] as IncidentRecord
    expect(secondSaved.incident_id).toBe(firstIncident.incident_id)
  })

  it('propagates trace_id from DiagnosisEvent to ActionEvent', async () => {
    const event = makeKinesisEvent(makeDiagnosis({ trace_id: 'trace-xyz-456' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    const actionEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(actionEvent.trace_id).toBe('trace-xyz-456')
  })

  it('sets diagnosis_event_id reference in ActionEvent', async () => {
    const event = makeKinesisEvent(makeDiagnosis({ event_id: 'diag-specific' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    const actionEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(actionEvent.diagnosis_event_id).toBe('diag-specific')
  })

  it('critical + no incident → shutdown_recommended, escalated incident', async () => {
    const event = makeKinesisEvent(makeDiagnosis({ severity: 'critical' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    const savedIncident = incidentAdapter.saveIncident.mock.calls[0][0] as IncidentRecord
    expect(savedIncident.status).toBe('escalated')
    expect(savedIncident.escalated_at).toBeTruthy()

    const actionEvent = producer.putRecords.mock.calls[0][0][0].data
    expect(actionEvent.action).toBe('shutdown_recommended')
  })

  it('emits actions_emitted metric with action and severity tags', async () => {
    const event = makeKinesisEvent(makeDiagnosis())
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    expect(telemetry.increment).toHaveBeenCalledWith('actions_agent.actions_emitted', {
      action: 'alert',
      severity: 'warning',
    })
  })

  it('emits incidents_created metric on new incident', async () => {
    const event = makeKinesisEvent(makeDiagnosis())
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    expect(telemetry.increment).toHaveBeenCalledWith('actions_agent.incidents_created', {
      severity: 'warning',
    })
  })

  it('sends to DLQ when incident write fails', async () => {
    incidentAdapter.saveIncident.mockRejectedValueOnce(new Error('DynamoDB error'))

    const event = makeKinesisEvent(makeDiagnosis())
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    expect(dlq.buildDLQMessage).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'INCIDENT_WRITE_FAILED' })
    )
    expect(dlq.sendToDLQ).toHaveBeenCalledOnce()
    expect(producer.putRecords).not.toHaveBeenCalled()
  })

  it('continues trace from DiagnosisEvent', async () => {
    const event = makeKinesisEvent(makeDiagnosis({ trace_id: 'trace-abc' }))
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    expect(telemetry.continueTrace).toHaveBeenCalledWith('trace-abc', 'actions-agent.process')
  })

  it('records dynamodb latency for read and write', async () => {
    const event = makeKinesisEvent(makeDiagnosis())
    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    expect(telemetry.timing).toHaveBeenCalledWith(
      'actions_agent.dynamodb_latency_ms',
      expect.any(Number),
      { operation: 'read' }
    )
    expect(telemetry.timing).toHaveBeenCalledWith(
      'actions_agent.dynamodb_latency_ms',
      expect.any(Number),
      { operation: 'write' }
    )
  })

  it('processes multiple records in a batch', async () => {
    const diag1 = makeDiagnosis({ asset_id: 'robot-1' })
    const diag2 = makeDiagnosis({ asset_id: 'robot-2', event_id: 'diag-2' })
    const event = {
      Records: [
        {
          kinesis: {
            data: Buffer.from(JSON.stringify(diag1)).toString('base64'),
            partitionKey: 'robot-1',
            sequenceNumber: '1000',
            approximateArrivalTimestamp: Date.now(),
          },
          eventSource: 'aws:kinesis',
          eventSourceARN: 'arn:aws:kinesis:us-east-1:000:stream/r17-diagnosis',
        },
        {
          kinesis: {
            data: Buffer.from(JSON.stringify(diag2)).toString('base64'),
            partitionKey: 'robot-2',
            sequenceNumber: '1001',
            approximateArrivalTimestamp: Date.now(),
          },
          eventSource: 'aws:kinesis',
          eventSourceARN: 'arn:aws:kinesis:us-east-1:000:stream/r17-diagnosis',
        },
      ],
    }

    await handler.handle(event, { requestId: 'req-1', functionName: 'actions-agent' })

    expect(incidentAdapter.findActiveIncident).toHaveBeenCalledTimes(2)
    expect(producer.putRecords).toHaveBeenCalledTimes(2)
  })
})
