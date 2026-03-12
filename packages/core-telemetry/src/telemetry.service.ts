/**
 * TelemetryService — spans and metrics for Lambda services.
 *
 * Wraps the OpenTelemetry API with a simplified interface.
 * All metric names are auto-prefixed with `streaming_agents.`.
 */

import { type Span, type Tracer, context, trace } from '@opentelemetry/api'
import type { Counter, Histogram, Meter, ObservableGauge } from '@opentelemetry/api'
import { metrics } from '@opentelemetry/api'
import { METRIC_PREFIX } from './constants.js'

export class TelemetryService {
  private readonly tracer: Tracer
  private readonly meter: Meter
  private readonly counters = new Map<string, Counter>()
  private readonly histograms = new Map<string, Histogram>()
  private readonly gauges = new Map<string, ObservableGauge>()
  private readonly gaugeValues = new Map<string, { value: number; tags: Record<string, string> }>()

  constructor(serviceName: string) {
    this.tracer = trace.getTracer(serviceName)
    this.meter = metrics.getMeter(serviceName)
  }

  /** Start a new span as a child of the current active context. */
  startSpan(name: string, attributes?: Record<string, string | number>): Span {
    const span = this.tracer.startSpan(name, { attributes }, context.active())
    return span
  }

  /**
   * Continue a trace from a propagated trace ID (e.g., from IngestedEvent.trace_id).
   * Creates a new span linked to the given trace context.
   */
  continueTrace(traceId: string, spanName: string): Span {
    const parentContext = trace.setSpanContext(context.active(), {
      traceId,
      spanId: '0000000000000000',
      traceFlags: 1,
      isRemote: true,
    })
    return this.tracer.startSpan(spanName, {}, parentContext)
  }

  /** Increment a counter metric. Name is auto-prefixed with `streaming_agents.`. */
  increment(name: string, tags?: Record<string, string>): void {
    const prefixed = `${METRIC_PREFIX}.${name}`
    let counter = this.counters.get(prefixed)
    if (!counter) {
      counter = this.meter.createCounter(prefixed)
      this.counters.set(prefixed, counter)
    }
    counter.add(1, tags)
  }

  /** Record a duration histogram. Name is auto-prefixed with `streaming_agents.`. */
  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    const prefixed = `${METRIC_PREFIX}.${name}`
    let histogram = this.histograms.get(prefixed)
    if (!histogram) {
      histogram = this.meter.createHistogram(prefixed, { unit: 'ms' })
      this.histograms.set(prefixed, histogram)
    }
    histogram.record(durationMs, tags)
  }

  /** Set a gauge metric value. Name is auto-prefixed with `streaming_agents.`. */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const prefixed = `${METRIC_PREFIX}.${name}`
    const key = this.gaugeKey(prefixed, tags)
    this.gaugeValues.set(key, { value, tags: tags ?? {} })

    if (!this.gauges.has(prefixed)) {
      const gauge = this.meter.createObservableGauge(prefixed)
      gauge.addCallback((result) => {
        for (const [k, entry] of this.gaugeValues) {
          if (k.startsWith(`${prefixed}|`)) {
            result.observe(entry.value, entry.tags)
          }
        }
      })
      this.gauges.set(prefixed, gauge)
    }
  }

  /** Extract current trace context for propagation into downstream events. */
  getTraceContext(): { traceId?: string; spanId?: string } {
    const span = trace.getActiveSpan()
    if (!span) return {}
    const ctx = span.spanContext()
    return { traceId: ctx.traceId, spanId: ctx.spanId }
  }

  /** Force flush all pending spans and metrics (call before Lambda response). */
  async flush(): Promise<void> {
    const provider = trace.getTracerProvider()
    if ('forceFlush' in provider && typeof provider.forceFlush === 'function') {
      await (provider as { forceFlush(): Promise<void> }).forceFlush()
    }
    const meterProvider = metrics.getMeterProvider()
    if ('forceFlush' in meterProvider && typeof meterProvider.forceFlush === 'function') {
      await (meterProvider as { forceFlush(): Promise<void> }).forceFlush()
    }
  }

  private gaugeKey(name: string, tags?: Record<string, string>): string {
    const tagStr = tags
      ? Object.entries(tags)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
      : ''
    return `${name}|${tagStr}`
  }
}
