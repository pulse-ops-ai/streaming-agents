import { describe, expect, it } from 'vitest'
import { LOGGER, METRIC_PREFIX, TELEMETRY } from '../constants.js'

describe('constants', () => {
  it('LOGGER is a unique symbol', () => {
    expect(typeof LOGGER).toBe('symbol')
    expect(LOGGER.toString()).toContain('LOGGER')
  })

  it('TELEMETRY is a unique symbol', () => {
    expect(typeof TELEMETRY).toBe('symbol')
    expect(TELEMETRY.toString()).toContain('TELEMETRY')
  })

  it('LOGGER and TELEMETRY are different symbols', () => {
    expect(LOGGER).not.toBe(TELEMETRY)
  })

  it('METRIC_PREFIX is streaming_agents', () => {
    expect(METRIC_PREFIX).toBe('streaming_agents')
  })
})
