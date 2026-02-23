import { randomUUID } from 'node:crypto'
import type { DiagnosisEvent, RiskEvent } from '@streaming-agents/core-contracts'
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
import type { BedrockAdapter } from './adapters/bedrock.adapter.js'
import type { AssetStateRepository } from './adapters/dynamodb.adapter.js'
import { parseDiagnosisResponse } from './parser.js'
import { buildDiagnosisPrompt } from './prompt.js'

export interface DiagnosisAgentConfig {
  serviceName: string
  outputStreamName: string
  bedrockModelId: string
  debounceMs: number
}

export class DiagnosisAgentHandler extends BaseLambdaHandler<KinesisStreamEvent, void> {
  constructor(
    protected readonly config: DiagnosisAgentConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
    private readonly repository: AssetStateRepository,
    private readonly producer: KinesisProducer,
    private readonly bedrock: BedrockAdapter,
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
      const riskEvent: RiskEvent = JSON.parse(raw)
      await this.processEvent(riskEvent, raw, record, context)
    }
    return { status: 'success' }
  }

  private async processEvent(
    riskEvent: RiskEvent,
    raw: string,
    record: KinesisStreamEvent['Records'][number],
    context: HandlerContext
  ): Promise<void> {
    // 1. Skip nominal risk — no Bedrock call
    if (riskEvent.risk_state === 'nominal') {
      this.telemetry.increment('diagnosis_agent.events_skipped', { reason: 'nominal' })
      this.logger.log('Skipped nominal risk', { asset_id: riskEvent.asset_id })
      return
    }

    this.telemetry.increment('diagnosis_agent.events_processed', {
      risk_state: riskEvent.risk_state,
    })

    // Continue trace from signal-agent
    const span = this.telemetry.continueTrace(riskEvent.trace_id, 'diagnosis-agent.process')
    span.setAttribute('telemetry.asset_id', riskEvent.asset_id)
    span.setAttribute('signal.risk_state', riskEvent.risk_state)
    span.setAttribute('signal.composite_risk', riskEvent.composite_risk)

    try {
      // 2. Debounce check
      const debounceSpan = this.telemetry.startSpan('diagnosis-agent.debounce-check')
      const state = await this.repository.get(riskEvent.asset_id)

      if (state?.last_diagnosis_at) {
        const elapsed = Date.now() - new Date(state.last_diagnosis_at).getTime()
        if (elapsed < this.config.debounceMs) {
          this.telemetry.increment('diagnosis_agent.events_skipped', { reason: 'debounce' })
          this.logger.log('Skipped debounce', {
            asset_id: riskEvent.asset_id,
            elapsed_ms: elapsed,
          })
          debounceSpan.end()
          return
        }
      }
      debounceSpan.end()

      // 3. Build prompt
      const prompt = buildDiagnosisPrompt(riskEvent)

      // 4. Call Bedrock
      const bedrockSpan = this.telemetry.startSpan('diagnosis-agent.bedrock.invoke', {
        'bedrock.model_id': this.config.bedrockModelId,
      })
      const bedrockStart = Date.now()

      let bedrockResult: Awaited<ReturnType<BedrockAdapter['invokeModel']>>
      try {
        bedrockResult = await this.bedrock.invokeModel(prompt)
      } catch (error) {
        bedrockSpan.recordException(error as Error)
        bedrockSpan.end()
        this.telemetry.timing('diagnosis_agent.bedrock_latency_ms', Date.now() - bedrockStart)
        await this.sendToDLQ('BEDROCK_INVOKE_FAILED', (error as Error).message, raw, record)
        return
      }

      this.telemetry.timing('diagnosis_agent.bedrock_latency_ms', Date.now() - bedrockStart)
      bedrockSpan.setAttribute('bedrock.prompt_tokens', bedrockResult.promptTokens)
      bedrockSpan.setAttribute('bedrock.completion_tokens', bedrockResult.completionTokens)
      this.telemetry.increment('diagnosis_agent.tokens_used', { token_type: 'prompt' })
      this.telemetry.increment('diagnosis_agent.tokens_used', { token_type: 'completion' })
      bedrockSpan.end()

      // 5. Parse response
      const parseSpan = this.telemetry.startSpan('diagnosis-agent.parse')
      const diagnosis = parseDiagnosisResponse(bedrockResult.text)

      if (!diagnosis) {
        parseSpan.end()
        await this.sendToDLQ('BEDROCK_PARSE_FAILED', 'Malformed LLM response', raw, record)
        return
      }
      parseSpan.end()

      // 6. Update debounce timestamp
      const now = new Date().toISOString()
      await this.repository.updateDiagnosisTimestamp(riskEvent.asset_id, now)

      // 7. Emit DiagnosisEvent
      const emitSpan = this.telemetry.startSpan('diagnosis-agent.emit')
      const diagnosisEvent: DiagnosisEvent = {
        event_id: randomUUID(),
        trace_id: riskEvent.trace_id,
        asset_id: riskEvent.asset_id,
        timestamp: now,
        risk_state: riskEvent.risk_state,
        composite_risk: riskEvent.composite_risk,
        root_cause: diagnosis.root_cause,
        evidence: diagnosis.evidence,
        confidence: diagnosis.confidence,
        recommended_actions: diagnosis.recommended_actions,
        severity: diagnosis.severity,
        model_id: this.config.bedrockModelId,
        prompt_tokens: bedrockResult.promptTokens,
        completion_tokens: bedrockResult.completionTokens,
      }

      span.setAttribute('diagnosis.confidence', diagnosis.confidence)
      span.setAttribute('diagnosis.severity', diagnosis.severity)

      await this.producer.putRecords([{ data: diagnosisEvent, partitionKey: riskEvent.asset_id }])
      emitSpan.end()

      this.logger.log('DiagnosisEvent emitted', {
        asset_id: riskEvent.asset_id,
        severity: diagnosis.severity,
        confidence: diagnosis.confidence,
      })
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
        service: 'diagnosis-agent',
      })
      await this.dlq.sendToDLQ(message)
      this.telemetry.increment('diagnosis_agent.dlq_sent', { error_code: errorCode })
    } catch (dlqErr) {
      this.logger.error('Failed to send to DLQ', {
        errorCode,
        originalError: errorMessage,
        dlqError: (dlqErr as Error).message,
      })
    }
  }
}
