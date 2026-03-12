/**
 * LoggerService — structured JSON logging with OTel trace correlation.
 *
 * Wraps pino and injects trace_id/span_id from the active OTel context
 * into every log line. Compatible with the NestJS LoggerService interface.
 */

import { trace } from '@opentelemetry/api'
import pino from 'pino'

/** NestJS LoggerService interface (subset we implement). */
export interface NestLoggerService {
  log(message: string, ...optionalParams: unknown[]): void
  error(message: string, ...optionalParams: unknown[]): void
  warn(message: string, ...optionalParams: unknown[]): void
  debug?(message: string, ...optionalParams: unknown[]): void
  verbose?(message: string, ...optionalParams: unknown[]): void
}

export class LoggerService implements NestLoggerService {
  private readonly logger: pino.Logger

  constructor(serviceName: string) {
    this.logger = pino({
      name: serviceName,
      level: process.env.LOG_LEVEL ?? 'info',
      formatters: {
        level(label: string) {
          return { level: label }
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      // mixin injects trace context into every log line
      mixin: () => {
        const span = trace.getActiveSpan()
        if (!span) return {}
        const ctx = span.spanContext()
        return {
          trace_id: ctx.traceId,
          span_id: ctx.spanId,
        }
      },
    })
  }

  log(message: string, ...optionalParams: unknown[]): void {
    this.logger.info(this.formatContext(optionalParams), message)
  }

  error(message: string, ...optionalParams: unknown[]): void {
    this.logger.error(this.formatContext(optionalParams), message)
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    this.logger.warn(this.formatContext(optionalParams), message)
  }

  debug(message: string, ...optionalParams: unknown[]): void {
    this.logger.debug(this.formatContext(optionalParams), message)
  }

  verbose(message: string, ...optionalParams: unknown[]): void {
    this.logger.trace(this.formatContext(optionalParams), message)
  }

  /** Get the underlying pino instance for advanced use. */
  getPino(): pino.Logger {
    return this.logger
  }

  private formatContext(params: unknown[]): Record<string, unknown> {
    if (params.length === 0) return {}
    // NestJS convention: last param may be the context string
    const last = params[params.length - 1]
    if (typeof last === 'string') {
      return { context: last }
    }
    if (typeof last === 'object' && last !== null) {
      return last as Record<string, unknown>
    }
    return {}
  }
}
