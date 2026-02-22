import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseLambdaHandler } from '../handler.js'
import type { HandlerContext, LambdaConfig, ProcessResult } from '../types.js'

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({
      end: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
    })),
    increment: vi.fn(),
    timing: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }
}

function makeLogger() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  }
}

const config: LambdaConfig = { serviceName: 'test-service' }

const ctx: HandlerContext = {
  requestId: 'req-123',
  functionName: 'test-fn',
}

class TestHandler extends BaseLambdaHandler<string, string> {
  public resultToReturn: ProcessResult<string> = { status: 'success', output: 'ok' }
  public onSuccessFn = vi.fn()
  public onDLQFn = vi.fn()

  protected async process(): Promise<ProcessResult<string>> {
    return this.resultToReturn
  }

  protected override async onSuccess(output: string, context: HandlerContext): Promise<void> {
    this.onSuccessFn(output, context)
  }

  protected override async onDLQ(
    error: Error,
    reason: string,
    payload: string,
    context: HandlerContext
  ): Promise<void> {
    this.onDLQFn(error, reason, payload, context)
  }
}

describe('BaseLambdaHandler', () => {
  let telemetry: ReturnType<typeof makeTelemetry>
  let logger: ReturnType<typeof makeLogger>
  let handler: TestHandler

  beforeEach(() => {
    telemetry = makeTelemetry()
    logger = makeLogger()
    handler = new TestHandler(config, telemetry as never, logger as never)
  })

  describe('ProcessResult routing', () => {
    it('calls onSuccess when result is success with output', async () => {
      handler.resultToReturn = { status: 'success', output: 'result-data' }

      await handler.handle('input', ctx)

      expect(handler.onSuccessFn).toHaveBeenCalledWith('result-data', ctx)
      expect(telemetry.increment).toHaveBeenCalledWith('messages.processed', { status: 'success' })
    })

    it('does not call onSuccess when success has no output', async () => {
      handler.resultToReturn = { status: 'success' }

      await handler.handle('input', ctx)

      expect(handler.onSuccessFn).not.toHaveBeenCalled()
      expect(telemetry.increment).toHaveBeenCalledWith('messages.processed', { status: 'success' })
    })

    it('logs reason and increments skip metric on skip', async () => {
      handler.resultToReturn = { status: 'skip', reason: 'duplicate' }

      await handler.handle('input', ctx)

      expect(logger.log).toHaveBeenCalledWith('Skipped', { reason: 'duplicate' })
      expect(telemetry.increment).toHaveBeenCalledWith('messages.processed', { status: 'skip' })
    })

    it('throws error on retry status to trigger Lambda retry', async () => {
      handler.resultToReturn = { status: 'retry', reason: 'throttled' }

      await expect(handler.handle('input', ctx)).rejects.toThrow('Retry: throttled')
      expect(telemetry.increment).toHaveBeenCalledWith('messages.processed', { status: 'retry' })
    })

    it('calls onDLQ and increments dlq metric on dlq status', async () => {
      const dlqError = new Error('schema invalid')
      handler.resultToReturn = { status: 'dlq', reason: 'validation_failed', error: dlqError }

      await handler.handle('input-data', ctx)

      expect(handler.onDLQFn).toHaveBeenCalledWith(dlqError, 'validation_failed', 'input-data', ctx)
      expect(telemetry.increment).toHaveBeenCalledWith('messages.dlq', {
        reason: 'validation_failed',
      })
    })
  })

  describe('OTel instrumentation', () => {
    it('creates a span with the service name', async () => {
      handler.resultToReturn = { status: 'success' }

      await handler.handle('input', ctx)

      expect(telemetry.startSpan).toHaveBeenCalledWith('test-service.process')
    })

    it('ends the span after processing', async () => {
      handler.resultToReturn = { status: 'success' }

      await handler.handle('input', ctx)

      const span = telemetry.startSpan.mock.results[0].value
      expect(span.end).toHaveBeenCalled()
    })

    it('sets error status on span when exception occurs', async () => {
      handler.resultToReturn = { status: 'retry', reason: 'boom' }

      await expect(handler.handle('input', ctx)).rejects.toThrow()

      const span = telemetry.startSpan.mock.results[0].value
      expect(span.setStatus).toHaveBeenCalledWith({ code: 2 })
    })

    it('records processing_time_ms timing on every invocation', async () => {
      handler.resultToReturn = { status: 'success' }

      await handler.handle('input', ctx)

      expect(telemetry.timing).toHaveBeenCalledWith('processing_time_ms', expect.any(Number))
    })

    it('records timing even when process throws', async () => {
      handler.resultToReturn = { status: 'retry', reason: 'fail' }

      await expect(handler.handle('input', ctx)).rejects.toThrow()

      expect(telemetry.timing).toHaveBeenCalledWith('processing_time_ms', expect.any(Number))
    })
  })

  describe('flush', () => {
    it('calls telemetry.flush() in finally block on success', async () => {
      handler.resultToReturn = { status: 'success' }

      await handler.handle('input', ctx)

      expect(telemetry.flush).toHaveBeenCalledTimes(1)
    })

    it('calls telemetry.flush() in finally block even on error', async () => {
      handler.resultToReturn = { status: 'retry', reason: 'fail' }

      await expect(handler.handle('input', ctx)).rejects.toThrow()

      expect(telemetry.flush).toHaveBeenCalledTimes(1)
    })
  })

  describe('default onDLQ', () => {
    it('logs the error when onDLQ is not overridden', async () => {
      // Use a handler that does NOT override onDLQ
      class DefaultDLQHandler extends BaseLambdaHandler<string, string> {
        protected async process(): Promise<ProcessResult<string>> {
          return { status: 'dlq', reason: 'bad data', error: new Error('parse failed') }
        }
      }

      const defaultHandler = new DefaultDLQHandler(config, telemetry as never, logger as never)
      await defaultHandler.handle('input', ctx)

      expect(logger.error).toHaveBeenCalledWith(
        'DLQ: bad data',
        expect.objectContaining({ error: 'parse failed' })
      )
    })
  })
})
