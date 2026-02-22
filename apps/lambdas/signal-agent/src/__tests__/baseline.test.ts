import { describe, expect, it } from 'vitest'
import { computeAlpha, initBaselines, updateBaselines } from '../baseline.js'

describe('computeAlpha', () => {
  it('computes alpha for window 60', () => {
    expect(computeAlpha(60)).toBeCloseTo(2 / 61)
  })

  it('computes alpha for window 1', () => {
    expect(computeAlpha(1)).toBeCloseTo(1.0)
  })

  it('computes alpha for window 10', () => {
    expect(computeAlpha(10)).toBeCloseTo(2 / 11)
  })
})

describe('initBaselines', () => {
  it('initializes with value as mean, zero variance/stddev', () => {
    const b = initBaselines(38.5)
    expect(b.mean).toBe(38.5)
    expect(b.variance).toBe(0)
    expect(b.std_dev).toBe(0)
  })
})

describe('updateBaselines', () => {
  const alpha = computeAlpha(60) // ~0.0328

  it('updates mean towards the new value', () => {
    const current = { mean: 38.0, variance: 0.5, std_dev: Math.sqrt(0.5) }
    const updated = updateBaselines(current, 40.0, alpha)

    // New mean should be between 38.0 and 40.0, closer to 38.0 (small alpha)
    expect(updated.mean).toBeGreaterThan(38.0)
    expect(updated.mean).toBeLessThan(40.0)
  })

  it('increases variance when new value is far from mean', () => {
    const current = { mean: 38.0, variance: 0.1, std_dev: Math.sqrt(0.1) }
    const updated = updateBaselines(current, 50.0, alpha)

    expect(updated.variance).toBeGreaterThan(current.variance)
  })

  it('decreases variance when new value is close to mean', () => {
    const current = { mean: 38.0, variance: 10.0, std_dev: Math.sqrt(10.0) }
    const updated = updateBaselines(current, 38.0, alpha)

    expect(updated.variance).toBeLessThan(current.variance)
  })

  it('std_dev is sqrt of variance', () => {
    const current = { mean: 10.0, variance: 1.0, std_dev: 1.0 }
    const updated = updateBaselines(current, 12.0, alpha)

    expect(updated.std_dev).toBeCloseTo(Math.sqrt(updated.variance))
  })

  it('converges mean over many identical readings', () => {
    let baseline = initBaselines(0)
    for (let i = 0; i < 200; i++) {
      baseline = updateBaselines(baseline, 10.0, alpha)
    }

    // After 200 readings with alpha ~0.033, mean should be very close to 10.0
    expect(baseline.mean).toBeCloseTo(10.0, 1)
  })

  it('tracks a sequence of values correctly', () => {
    const a = computeAlpha(3) // alpha = 0.5, fast for testing
    let baseline = initBaselines(10)

    baseline = updateBaselines(baseline, 12, a)
    // mean = 0.5*12 + 0.5*10 = 11
    expect(baseline.mean).toBeCloseTo(11.0)

    baseline = updateBaselines(baseline, 14, a)
    // mean = 0.5*14 + 0.5*11 = 12.5
    expect(baseline.mean).toBeCloseTo(12.5)
  })
})
