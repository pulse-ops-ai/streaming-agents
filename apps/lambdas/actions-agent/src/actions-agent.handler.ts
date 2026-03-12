import { randomUUID } from 'node:crypto'
import type { ActionEvent, DiagnosisEvent } from '@streaming-agents/core-contracts'
import type {
  DLQPublisher,
  KinesisProducer,
  KinesisStreamEvent,
} from '@streaming-agents/core-kinesis'
import type { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import {
  BaseLambdaHandler,
  type HandlerContext,
  type ProcessResult,
} from '@streaming-agents/lambda-base'
import type { IncidentAdapter } from './adapters/dynamodb.adapter.js'
import { buildIncidentRecord } from './incident-builder.js'
import { evaluateActionRules } from './rules.js'

export interface ActionsAgentConfig {
  serviceName: string
  outputStreamName: string
  escalationThresholdMs: number
  resolvedTtlHours: number
}

export class ActionsAgentHandler extends BaseLambdaHandler<KinesisStreamEvent, void> {
  constructor(
    protected readonly config: ActionsAgentConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
    private readonly incidentAdapter: IncidentAdapter,
    private readonly producer: KinesisProducer,
    private readonly dlq: DLQPublisher
  ) {
    super(config, telemetry, logger)
  }

  protected async process(
    event: KinesisStreamEvent,
    context: HandlerContext
  ): Promise<ProcessResult<void>> {
    for (const record of event.Records) {
      const raw = Buffer.from(record.kinesis.data, 'base64').toString('utf-8')
      const diagnosis: DiagnosisEvent = JSON.parse(raw)
      await this.processEvent(diagnosis, raw, record, context)
    }
    return { status: 'success' }
  }

  private async processEvent(
    diagnosis: DiagnosisEvent,
    raw: string,
    record: KinesisStreamEvent['Records'][number],
    _context: HandlerContext
  ): Promise<void> {
    const span = this.telemetry.continueTrace(diagnosis.trace_id, 'actions-agent.process')
    span.setAttribute('telemetry.asset_id', diagnosis.asset_id)
    span.setAttribute('diagnosis.severity', diagnosis.severity)

    try {
      // 1. Load active incident
      const loadSpan = this.telemetry.startSpan('actions-agent.load-incident')
      const loadStart = Date.now()
      const existingIncident = await this.incidentAdapter.findActiveIncident(diagnosis.asset_id)
      this.telemetry.timing('actions_agent.dynamodb_latency_ms', Date.now() - loadStart, {
        operation: 'read',
      })
      loadSpan.end()

      // 2. Evaluate action rules
      const evalSpan = this.telemetry.startSpan('actions-agent.evaluate')
      const now = new Date().toISOString()
      const ruleOutput = evaluateActionRules({
        diagnosis,
        existingIncident,
        now,
        escalationThresholdMs: this.config.escalationThresholdMs,
      })
      span.setAttribute('action.type', ruleOutput.action)
      evalSpan.end()

      // 3. Write incident if needed
      const actionEventId = randomUUID()
      let incidentId: string | null = null
      let incidentStatus: string | null = null

      if (ruleOutput.incident.operation !== 'none') {
        const writeSpan = this.telemetry.startSpan('actions-agent.dynamodb.write')
        const writeStart = Date.now()

        const incidentRecord = buildIncidentRecord(
          diagnosis,
          ruleOutput.action,
          ruleOutput.incident.operation === 'create' ? null : existingIncident,
          now,
          this.config.resolvedTtlHours,
          actionEventId
        )

        try {
          await this.incidentAdapter.saveIncident(incidentRecord)
        } catch (error) {
          writeSpan.end()
          this.telemetry.timing('actions_agent.dynamodb_latency_ms', Date.now() - writeStart, {
            operation: 'write',
          })
          await this.sendToDLQ('INCIDENT_WRITE_FAILED', (error as Error).message, raw, record)
          return
        }

        this.telemetry.timing('actions_agent.dynamodb_latency_ms', Date.now() - writeStart, {
          operation: 'write',
        })
        writeSpan.end()

        incidentId = incidentRecord.incident_id
        incidentStatus = incidentRecord.status

        if (ruleOutput.incident.operation === 'create') {
          this.telemetry.increment('actions_agent.incidents_created', {
            severity: diagnosis.severity,
          })
        }
        if (incidentRecord.status === 'escalated' && existingIncident?.status !== 'escalated') {
          this.telemetry.increment('actions_agent.incidents_escalated')
        }

        span.setAttribute('incident.status', incidentRecord.status)
      } else if (existingIncident) {
        incidentId = existingIncident.incident_id
        incidentStatus = existingIncident.status
        span.setAttribute('incident.status', existingIncident.status)
      }

      // 4. Emit ActionEvent
      const emitSpan = this.telemetry.startSpan('actions-agent.emit')
      const actionEvent: ActionEvent = {
        event_id: actionEventId,
        trace_id: diagnosis.trace_id,
        asset_id: diagnosis.asset_id,
        timestamp: now,
        action: ruleOutput.action,
        severity: diagnosis.severity,
        incident_id: incidentId,
        incident_status: incidentStatus as ActionEvent['incident_status'],
        reason: ruleOutput.reason,
        diagnosis_event_id: diagnosis.event_id,
      }

      await this.producer.putRecords([{ data: actionEvent, partitionKey: diagnosis.asset_id }])
      emitSpan.end()

      this.telemetry.increment('actions_agent.actions_emitted', {
        action: ruleOutput.action,
        severity: diagnosis.severity,
      })

      this.logger.log('ActionEvent emitted', {
        asset_id: diagnosis.asset_id,
        action: ruleOutput.action,
        incident_id: incidentId,
      })
    } catch (error) {
      await this.sendToDLQ('PROCESSING_FAILED', (error as Error).message, raw, record)
    } finally {
      span.end()
    }
  }

  private async sendToDLQ(
    errorCode: string,
    errorMessage: string,
    raw: string,
    record: KinesisStreamEvent['Records'][number]
  ): Promise<void> {
    try {
      const message = this.dlq.buildDLQMessage({
        errorCode,
        errorMessage,
        originalRecord: Buffer.from(raw).toString('base64'),
        sourceStream: record.eventSourceARN.split('/').pop() ?? record.eventSourceARN,
        sourcePartition: record.kinesis.partitionKey,
        sourceSequence: record.kinesis.sequenceNumber,
        service: 'actions-agent',
      })
      await this.dlq.sendToDLQ(message)
    } catch (dlqErr) {
      this.logger.error('Failed to send to DLQ', {
        errorCode,
        originalError: errorMessage,
        dlqError: (dlqErr as Error).message,
      })
    }
  }
}
