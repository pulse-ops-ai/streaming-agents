/**
 * OTel SDK initialization for Lambda services.
 *
 * One-call setup: `initOtel('ingestion')` → configured NodeSDK.
 * Environment-aware: uses no-op exporters when OTLP endpoint is unavailable in local mode.
 */

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader, type PushMetricExporter } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

export interface OtelOptions {
  /** Override OTLP endpoint (defaults to OTEL_EXPORTER_OTLP_ENDPOINT env var). */
  endpoint?: string
  /** Override metric export interval in ms (defaults to OTEL_METRICS_EXPORT_INTERVAL or 10000). */
  metricIntervalMs?: number
}

/**
 * Initialize the OpenTelemetry SDK for a Lambda service.
 *
 * In local mode without an OTLP endpoint, uses no-op exporters so the service
 * boots without crashing. Call `sdk.shutdown()` in cleanup if needed.
 */
export function initOtel(serviceName: string, opts?: OtelOptions): NodeSDK {
  const nodeEnv = process.env.NODE_ENV ?? 'local'
  const endpoint = opts?.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? undefined
  const metricIntervalMs =
    opts?.metricIntervalMs ??
    Number.parseInt(process.env.OTEL_METRICS_EXPORT_INTERVAL ?? '10000', 10)

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    'deployment.environment': nodeEnv,
  })

  // If no endpoint is configured in local mode, use no-op (SDK defaults)
  const hasEndpoint = !!endpoint

  const spanProcessor = hasEndpoint
    ? new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }))
    : undefined

  let metricReader: PeriodicExportingMetricReader | undefined
  if (hasEndpoint) {
    const metricExporter: PushMetricExporter = new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
    })
    metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: metricIntervalMs,
    })
  }

  const sdk = new NodeSDK({
    resource,
    spanProcessors: spanProcessor ? [spanProcessor] : [],
    ...(metricReader ? { metricReader } : {}),
  })

  sdk.start()
  return sdk
}
