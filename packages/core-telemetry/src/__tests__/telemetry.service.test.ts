import { beforeEach, describe, expect, it } from 'vitest'
import { TelemetryService } from '../telemetry.service.js'

describe('TelemetryService', () => {
  let service: TelemetryService

  beforeEach(() => {
    service = new TelemetryService('test-service')
  })

  describe('startSpan', () => {
    it('returns a span with the given name', () => {
      const span = service.startSpan('test.operation')
      expect(span).toBeDefined()
      expect(span.spanContext()).toBeDefined()
      span.end()
    })

    it('accepts attributes on the span', () => {
      const span = service.startSpan('test.operation', {
        'test.attr': 'value',
        'test.count': 42,
      })
      expect(span).toBeDefined()
      span.end()
    })
  })

  describe('continueTrace', () => {
    it('creates a span without crashing', () => {
      const traceId = '0af7651916cd43dd8448eb211c80319c' // pragma: allowlist secret
      const span = service.continueTrace(traceId, 'continued.span')
      expect(span).toBeDefined()
      expect(span.spanContext()).toBeDefined()
      span.end()
    })
  })

  describe('getTraceContext', () => {
    it('returns empty object when no span is active', () => {
      const ctx = service.getTraceContext()
      expect(ctx).toEqual({})
    })
  })

  describe('metrics', () => {
    it('increment does not throw', () => {
      expect(() => service.increment('test.counter')).not.toThrow()
    })

    it('increment with tags does not throw', () => {
      expect(() => service.increment('test.counter', { source_type: 'edge' })).not.toThrow()
    })

    it('timing does not throw', () => {
      expect(() => service.timing('test.latency', 42.5)).not.toThrow()
    })

    it('timing with tags does not throw', () => {
      expect(() => service.timing('test.latency', 42.5, { operation: 'read' })).not.toThrow()
    })

    it('gauge does not throw', () => {
      expect(() => service.gauge('test.score', 0.85)).not.toThrow()
    })

    it('gauge with tags does not throw', () => {
      expect(() => service.gauge('test.score', 0.85, { asset_id: 'R-17' })).not.toThrow()
    })

    it('multiple increments to same counter do not throw', () => {
      expect(() => {
        service.increment('test.counter')
        service.increment('test.counter')
        service.increment('test.counter')
      }).not.toThrow()
    })
  })

  describe('flush', () => {
    it('resolves without error (no-op providers)', async () => {
      await expect(service.flush()).resolves.toBeUndefined()
    })
  })
})
