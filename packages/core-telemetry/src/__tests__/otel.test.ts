import type { NodeSDK } from '@opentelemetry/sdk-node'
import { afterEach, describe, expect, it } from 'vitest'

describe('initOtel', () => {
  let sdk: NodeSDK | undefined

  afterEach(async () => {
    if (sdk) {
      await sdk.shutdown()
      sdk = undefined
    }
  })

  it('starts without an OTLP endpoint (no-op mode)', async () => {
    const prev = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    Reflect.deleteProperty(process.env, 'OTEL_EXPORTER_OTLP_ENDPOINT')

    const { initOtel } = await import('../otel.js')
    sdk = initOtel('test-service-noop')
    expect(sdk).toBeDefined()

    if (prev !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prev
  })

  it('starts with an explicit endpoint option', async () => {
    const { initOtel } = await import('../otel.js')
    sdk = initOtel('test-service-endpoint', {
      endpoint: 'http://localhost:4318',
      metricIntervalMs: 60_000,
    })
    expect(sdk).toBeDefined()
  })

  it('starts in sandbox mode without crashing', async () => {
    const prevEnv = process.env.NODE_ENV
    const prevEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    process.env.NODE_ENV = 'sandbox'
    Reflect.deleteProperty(process.env, 'OTEL_EXPORTER_OTLP_ENDPOINT')

    const { initOtel } = await import('../otel.js')
    sdk = initOtel('test-service-sandbox')
    expect(sdk).toBeDefined()

    process.env.NODE_ENV = prevEnv
    if (prevEndpoint !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prevEndpoint
  })
})
