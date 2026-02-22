import { R17TelemetryEventV2Schema } from '@streaming-agents/schemas'
import { describe, expect, it } from 'vitest'
import { buildEvent, resetSequence } from '../event-builder.js'
import { createPRNG, gaussianNoise } from '../prng.js'
import { getScenario } from '../scenarios/index.js'

function generateEvents(scenarioName: string, seed: string, burstCount: number) {
  const scenario = getScenario(scenarioName)
  const prng = createPRNG(seed)
  const noise = (mean: number, std: number) => gaussianNoise(prng, mean, std)
  const baseTime = new Date('2025-01-01T00:00:00Z')
  resetSequence()

  const events = []
  for (let tick = 0; tick < burstCount; tick++) {
    const signals = scenario.generate(tick, burstCount, noise, prng)
    events.push(buildEvent(signals, { assetId: 'R-1', baseTime, tick }))
  }
  return events
}

describe('Determinism', () => {
  it('same seed + same scenario produces byte-identical events', () => {
    const events1 = generateEvents('healthy', 'test-seed-abc', 120)
    const events2 = generateEvents('healthy', 'test-seed-abc', 120)

    expect(JSON.stringify(events1)).toBe(JSON.stringify(events2))
  })

  it('different seeds produce different events', () => {
    const events1 = generateEvents('healthy', 'seed-a', 10)
    const events2 = generateEvents('healthy', 'seed-b', 10)

    // Board temperatures should differ (different noise sequences)
    const temps1 = events1.map((e) => e.board_temperature_c)
    const temps2 = events2.map((e) => e.board_temperature_c)
    expect(temps1).not.toEqual(temps2)
  })
})

describe('Schema Validation', () => {
  it('all healthy events validate against R17TelemetryV2Event Zod schema', () => {
    const events = generateEvents('healthy', 'schema-test', 10)
    for (const event of events) {
      const result = R17TelemetryEventV2Schema.safeParse(event)
      if (!result.success) {
        throw new Error(`Validation failed at event: ${JSON.stringify(result.error.issues)}`)
      }
    }
  })

  it('all joint_3_degradation events validate against Zod schema', () => {
    const events = generateEvents('joint_3_degradation', 'schema-j3', 120)
    for (const event of events) {
      expect(R17TelemetryEventV2Schema.safeParse(event).success).toBe(true)
    }
  })

  it('all thermal_runaway events validate against Zod schema', () => {
    const events = generateEvents('thermal_runaway', 'schema-tr', 120)
    for (const event of events) {
      expect(R17TelemetryEventV2Schema.safeParse(event).success).toBe(true)
    }
  })

  it('all vibration_anomaly events validate against Zod schema', () => {
    const events = generateEvents('vibration_anomaly', 'schema-va', 120)
    for (const event of events) {
      expect(R17TelemetryEventV2Schema.safeParse(event).success).toBe(true)
    }
  })

  it('all random_walk events validate against Zod schema', () => {
    const events = generateEvents('random_walk', 'schema-rw', 120)
    for (const event of events) {
      expect(R17TelemetryEventV2Schema.safeParse(event).success).toBe(true)
    }
  })
})

describe('healthy scenario', () => {
  it('all signals stay within normal ranges for all ticks', () => {
    const events = generateEvents('healthy', 'healthy-test', 120)

    for (const e of events) {
      expect(e.board_temperature_c).toBeGreaterThan(25)
      expect(e.board_temperature_c).toBeLessThan(50)
      expect(e.accel_magnitude_ms2).toBeGreaterThan(8)
      expect(e.accel_magnitude_ms2).toBeLessThan(12)
      expect(e.gyro_magnitude_rads).toBeGreaterThanOrEqual(0)
      expect(e.gyro_magnitude_rads).toBeLessThan(0.1)
      expect(e.joint_position_error_deg).toBeGreaterThanOrEqual(0)
      expect(e.joint_position_error_deg).toBeLessThan(0.5)
    }
  })
})

describe('joint_3_degradation scenario', () => {
  it('position error starts ~0.1° and ends ~3.5° at tick 120', () => {
    const events = generateEvents('joint_3_degradation', 'j3-test', 120)

    const firstError = events[0].joint_position_error_deg as number
    const lastError = events[119].joint_position_error_deg as number

    expect(firstError).toBeGreaterThan(0)
    expect(firstError).toBeLessThan(0.5)
    expect(lastError).toBeGreaterThan(2.5)
    expect(lastError).toBeLessThan(5.0)
  })

  it('temperature rises from ~38°C to ~52°C', () => {
    const events = generateEvents('joint_3_degradation', 'j3-temp', 120)

    const firstTemp = events[0].board_temperature_c as number
    const lastTemp = events[119].board_temperature_c as number

    expect(firstTemp).toBeGreaterThan(34)
    expect(firstTemp).toBeLessThan(42)
    expect(lastTemp).toBeGreaterThan(48)
    expect(lastTemp).toBeLessThan(58)
  })
})

describe('thermal_runaway scenario', () => {
  it('temperature stable at ~40°C through tick 60, spikes to ~70°C by tick 120', () => {
    const events = generateEvents('thermal_runaway', 'tr-test', 120)

    // Mid-point (tick 30): should be stable around 40°C
    const midTemp = events[30].board_temperature_c as number
    expect(midTemp).toBeGreaterThan(37)
    expect(midTemp).toBeLessThan(44)

    // Tick 60: still stable
    const tick60Temp = events[60].board_temperature_c as number
    expect(tick60Temp).toBeGreaterThan(37)
    expect(tick60Temp).toBeLessThan(44)

    // Tick 119: should be near 70°C (40 + 59 * 0.5 = 69.5)
    const lastTemp = events[119].board_temperature_c as number
    expect(lastTemp).toBeGreaterThan(60)
    expect(lastTemp).toBeLessThan(80)
  })
})

describe('vibration_anomaly scenario', () => {
  it('accel starts ~9.81 and ends ~15.0 at tick 120', () => {
    const events = generateEvents('vibration_anomaly', 'va-test', 120)

    const firstAccel = events[0].accel_magnitude_ms2 as number
    const lastAccel = events[119].accel_magnitude_ms2 as number

    expect(firstAccel).toBeGreaterThan(8.5)
    expect(firstAccel).toBeLessThan(11)
    expect(lastAccel).toBeGreaterThan(13)
    expect(lastAccel).toBeLessThan(17)
  })

  it('gyro increases sympathetically from ~0.02 to ~0.15', () => {
    const events = generateEvents('vibration_anomaly', 'va-gyro', 120)

    const firstGyro = events[0].gyro_magnitude_rads as number
    const lastGyro = events[119].gyro_magnitude_rads as number

    expect(firstGyro).toBeGreaterThanOrEqual(0)
    expect(firstGyro).toBeLessThan(0.06)
    expect(lastGyro).toBeGreaterThan(0.1)
    expect(lastGyro).toBeLessThan(0.3)
  })
})

describe('Event structure', () => {
  it('events have correct schema_version and source', () => {
    const events = generateEvents('healthy', 'struct-test', 5)

    for (const e of events) {
      expect(e.schema_version).toBe('r17.telemetry.v2')
      expect(e.source).toBe('simulator')
      expect(e.sampling_hz).toBe(2)
      expect(e.asset_id).toBe('R-1')
      expect(e.control_mode).toBe('stiff')
    }
  })

  it('timestamps increment by 500ms per tick', () => {
    const events = generateEvents('healthy', 'time-test', 5)

    const timestamps = events.map((e) => new Date(e.timestamp as string).getTime())
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] - timestamps[i - 1]).toBe(500)
    }
  })
})
