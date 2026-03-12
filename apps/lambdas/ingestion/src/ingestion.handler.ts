import { randomUUID } from 'node:crypto'
import type { IngestedEvent } from '@streaming-agents/core-contracts'
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
import { R17TelemetryEventV2Schema } from '@streaming-agents/schemas'
import { mapSourceType } from './source-mapper.js'

export interface IngestionConfig {
  serviceName: string
  inputStreamName: string
  outputStreamName: string
  batchParallelism: number
}

const SPAN_STATUS_ERROR = 2

export class IngestionHandler extends BaseLambdaHandler<KinesisStreamEvent, void> {
  constructor(
    protected readonly config: IngestionConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
    private readonly producer: KinesisProducer,
    private readonly dlq: DLQPublisher
  ) {
    super(config, telemetry, logger)
  }

  protected async process(
    event: KinesisStreamEvent,
    context: HandlerContext
  ): Promise<ProcessResult<void>> {
    const records = event.Records
    const chunks = this.chunk(records, this.config.batchParallelism)

    for (const chunk of chunks) {
      await Promise.allSettled(chunk.map((record) => this.processRecord(record, context)))
    }

    return { status: 'success' }
  }

  private async processRecord(
    record: KinesisStreamEvent['Records'][number],
    context: HandlerContext
  ): Promise<void> {
    const raw = Buffer.from(record.kinesis.data, 'base64').toString('utf-8')
    const sourceStream = record.eventSourceARN.split('/').pop() ?? record.eventSourceARN
    const partitionKey = record.kinesis.partitionKey
    const sequenceNumber = record.kinesis.sequenceNumber

    // Deserialize
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      await this.sendToDLQ('PARSE_FAILED', `JSON parse error: ${(err as Error).message}`, {
        raw,
        sourceStream,
        partitionKey,
        sequenceNumber,
        error: err,
      })
      this.telemetry.increment('ingestion.events_processed', { status: 'invalid' })
      return
    }

    // Validate
    const result = R17TelemetryEventV2Schema.safeParse(parsed)
    if (!result.success) {
      await this.sendToDLQ('SCHEMA_INVALID', 'Zod validation failed', {
        raw,
        sourceStream,
        partitionKey,
        sequenceNumber,
        error: new Error('Schema validation failed'),
        errorDetails: result.error.issues,
      })
      this.telemetry.increment('ingestion.events_processed', { status: 'invalid' })
      this.telemetry.increment('ingestion.validation_errors', { error_code: 'SCHEMA_INVALID' })
      return
    }

    const validated = result.data
    const sourceType = mapSourceType(validated.source)

    // OTel span for this record
    const span = this.telemetry.startSpan('ingestion.process', {
      'telemetry.asset_id': validated.asset_id,
      'telemetry.source_type': sourceType,
      'telemetry.schema_version': validated.schema_version,
    })

    try {
      const eventId = randomUUID()
      const traceId = span.spanContext?.().traceId ?? randomUUID().replace(/-/g, '')

      span.setAttribute?.('ingestion.event_id', eventId)

      const enriched: IngestedEvent = {
        event_id: eventId,
        trace_id: traceId,
        ingested_at: new Date().toISOString(),
        source_partition: partitionKey,
        source_sequence: sequenceNumber,
        source_type: sourceType,
        payload: validated,
      }

      // Fan-out
      await this.producer.putRecords([{ data: enriched, partitionKey: validated.asset_id }])

      this.telemetry.increment('ingestion.events_processed', {
        status: 'valid',
        source_type: sourceType,
      })
    } catch (err) {
      span.setStatus?.({ code: SPAN_STATUS_ERROR })
      span.recordException?.(err as Error)

      await this.sendToDLQ('FANOUT_FAILED', `Kinesis write failed: ${(err as Error).message}`, {
        raw,
        sourceStream,
        partitionKey,
        sequenceNumber,
        error: err,
      })
      this.telemetry.increment('ingestion.dlq_sent', { error_code: 'FANOUT_FAILED' })
    } finally {
      span.end()
    }
  }

  private async sendToDLQ(
    errorCode: string,
    errorMessage: string,
    opts: {
      raw: string
      sourceStream: string
      partitionKey: string
      sequenceNumber: string
      error: unknown
      errorDetails?: unknown
    }
  ): Promise<void> {
    try {
      const message = this.dlq.buildDLQMessage({
        errorCode,
        errorMessage,
        originalRecord: Buffer.from(opts.raw).toString('base64'),
        sourceStream: opts.sourceStream,
        sourcePartition: opts.partitionKey,
        sourceSequence: opts.sequenceNumber,
        service: 'ingestion',
        errorDetails:
          opts.errorDetails ?? (opts.error instanceof Error ? opts.error.stack : undefined),
      })
      await this.dlq.sendToDLQ(message)
      this.telemetry.increment('ingestion.dlq_sent', { error_code: errorCode })
    } catch (dlqErr) {
      this.logger.error('Failed to send to DLQ', {
        errorCode,
        originalError: errorMessage,
        dlqError: (dlqErr as Error).message,
      })
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size))
    }
    return chunks
  }
}
