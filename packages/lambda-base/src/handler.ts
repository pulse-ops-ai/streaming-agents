import type { LoggerService } from '@streaming-agents/core-telemetry'
import type { TelemetryService } from '@streaming-agents/core-telemetry'
import type { HandlerContext, LambdaConfig, ProcessResult } from './types.js'

// SpanStatusCode.ERROR = 2 (stable OTel spec constant)
const SPAN_STATUS_ERROR = 2

export abstract class BaseLambdaHandler<TIn, TOut = void> {
  constructor(
    protected readonly config: LambdaConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService
  ) {}

  /**
   * Implement this method. The handler does NOT know
   * where the event came from or where results go.
   */
  protected abstract process(payload: TIn, context: HandlerContext): Promise<ProcessResult<TOut>>

  /**
   * Override to handle successful output (e.g., write to Kinesis).
   * Default: no-op.
   */
  protected async onSuccess(_output: TOut, _context: HandlerContext): Promise<void> {
    // Override in subclass
  }

  /**
   * Override to handle DLQ routing.
   * Default: logs error.
   */
  protected async onDLQ(
    error: Error,
    reason: string,
    _originalPayload: TIn,
    _context: HandlerContext
  ): Promise<void> {
    this.logger.error(`DLQ: ${reason}`, { error: error.message, stack: error.stack })
  }

  /**
   * Entry point called by the Lambda runtime adapter.
   * Wraps process() with OTel spans, error handling, and metrics.
   */
  async handle(event: TIn, context: HandlerContext): Promise<void> {
    const span = this.telemetry.startSpan(`${this.config.serviceName}.process`)
    const startTime = Date.now()

    try {
      const result = await this.process(event, context)

      switch (result.status) {
        case 'success':
          if (result.output !== undefined) await this.onSuccess(result.output, context)
          this.telemetry.increment('messages.processed', { status: 'success' })
          break
        case 'skip':
          this.telemetry.increment('messages.processed', { status: 'skip' })
          this.logger.log('Skipped', { reason: result.reason })
          break
        case 'retry':
          this.telemetry.increment('messages.processed', { status: 'retry' })
          throw new Error(`Retry: ${result.reason}`)
        case 'dlq':
          await this.onDLQ(result.error, result.reason, event, context)
          this.telemetry.increment('messages.dlq', { reason: result.reason })
          break
      }
    } catch (error) {
      span.setStatus({ code: SPAN_STATUS_ERROR })
      throw error
    } finally {
      this.telemetry.timing('processing_time_ms', Date.now() - startTime)
      span.end()
      await this.telemetry.flush()
    }
  }
}
