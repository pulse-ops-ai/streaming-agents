import type { ZScores } from '@streaming-agents/core-contracts'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIN_STDDEV,
  DEFAULT_NORMALIZE_DIVISOR,
  computeCompositeRisk,
  computeThresholdBreach,
  computeZScore,
  determineRiskState,
  getContributingSignals,
} from '../risk.js'

describe('computeZScore', () => {
  it('computes correct z-score for known values', () => {
    // value=12, mean=10, stdDev=2 → z = (12-10)/2 = 1.0
    expect(computeZScore(12, 10, 2)).toBeCloseTo(1.0)
  })

  it('computes negative z-score when below mean', () => {
    // value=8, mean=10, stdDev=2 → z = (8-10)/2 = -1.0
    expect(computeZScore(8, 10, 2)).toBeCloseTo(-1.0)
  })

  it('returns 0.0 for null values', () => {
    expect(computeZScore(null, 10, 2)).toBe(0.0)
  })

  it('uses MIN_STDDEV when stdDev is too small', () => {
    // value=10.01, mean=10, stdDev=0 → uses MIN_STDDEV=0.001
    // z = (10.01 - 10) / 0.001 = 10.0
    expect(computeZScore(10.01, 10, 0)).toBeCloseTo(10.0)
  })

  it('uses MIN_STDDEV when stdDev is below threshold', () => {
    expect(computeZScore(10.001, 10, 0.0001, 0.001)).toBeCloseTo(1.0)
  })

  it('does not use MIN_STDDEV when stdDev is above threshold', () => {
    // value=12, mean=10, stdDev=4 → z = 2/4 = 0.5
    expect(computeZScore(12, 10, 4, 0.001)).toBeCloseTo(0.5)
  })
})

describe('computeThresholdBreach', () => {
  it('returns 0.0 when all signals are below warn thresholds', () => {
    const signals = {
      board_temperature_c: 38,
      accel_magnitude_ms2: 9.81,
      gyro_magnitude_rads: 0.02,
      joint_position_error_deg: 0.1,
    }
    expect(computeThresholdBreach(signals)).toBe(0.0)
  })

  it('returns 0.5 when a signal is at warn threshold', () => {
    const signals = {
      board_temperature_c: 50, // exactly at warn
      accel_magnitude_ms2: 9.81,
      gyro_magnitude_rads: 0.02,
      joint_position_error_deg: 0.1,
    }
    expect(computeThresholdBreach(signals)).toBe(0.5)
  })

  it('returns 0.5 when a signal is between warn and critical', () => {
    const signals = {
      board_temperature_c: 55, // between 50 (warn) and 60 (critical)
      accel_magnitude_ms2: 9.81,
      gyro_magnitude_rads: 0.02,
      joint_position_error_deg: 0.1,
    }
    expect(computeThresholdBreach(signals)).toBe(0.5)
  })

  it('returns 1.0 when a signal is at critical threshold', () => {
    const signals = {
      board_temperature_c: 60, // exactly at critical
      accel_magnitude_ms2: 9.81,
      gyro_magnitude_rads: 0.02,
      joint_position_error_deg: 0.1,
    }
    expect(computeThresholdBreach(signals)).toBe(1.0)
  })

  it('returns 1.0 when any signal exceeds critical', () => {
    const signals = {
      board_temperature_c: 38,
      accel_magnitude_ms2: 16, // above critical 15
      gyro_magnitude_rads: 0.02,
      joint_position_error_deg: 0.1,
    }
    expect(computeThresholdBreach(signals)).toBe(1.0)
  })

  it('takes max across all signals', () => {
    const signals = {
      board_temperature_c: 55, // warn (0.5)
      accel_magnitude_ms2: 9.81, // none (0.0)
      gyro_magnitude_rads: 0.25, // critical (1.0)
      joint_position_error_deg: 0.1, // none (0.0)
    }
    expect(computeThresholdBreach(signals)).toBe(1.0)
  })

  it('checks all four threshold types', () => {
    // Joint position error warn
    expect(
      computeThresholdBreach({
        board_temperature_c: 30,
        accel_magnitude_ms2: 9,
        gyro_magnitude_rads: 0.01,
        joint_position_error_deg: 1.5, // warn at 1.0
      })
    ).toBe(0.5)

    // Gyro warn
    expect(
      computeThresholdBreach({
        board_temperature_c: 30,
        accel_magnitude_ms2: 9,
        gyro_magnitude_rads: 0.15, // warn at 0.1
        joint_position_error_deg: 0.1,
      })
    ).toBe(0.5)
  })

  it('ignores null signal values', () => {
    const signals = {
      board_temperature_c: null,
      accel_magnitude_ms2: null,
      gyro_magnitude_rads: null,
      joint_position_error_deg: 0.1,
    }
    expect(computeThresholdBreach(signals)).toBe(0.0)
  })
})

describe('computeCompositeRisk', () => {
  it('returns 0 when all z-scores are 0 and no threshold breach', () => {
    const zScores: ZScores = {
      position_error_z: 0,
      accel_z: 0,
      gyro_z: 0,
      temperature_z: 0,
    }
    expect(computeCompositeRisk(zScores, 0)).toBe(0)
  })

  it('computes correct risk with known z-scores', () => {
    const zScores: ZScores = {
      position_error_z: 3.0,
      accel_z: 0,
      gyro_z: 0,
      temperature_z: 0,
    }
    // raw = 0.35 * 3.0 + 0 + 0 + 0 + 0 = 1.05
    // normalized = 1.05 / 3.0 = 0.35
    expect(computeCompositeRisk(zScores, 0)).toBeCloseTo(0.35)
  })

  it('applies all weights correctly', () => {
    const zScores: ZScores = {
      position_error_z: 1.0,
      accel_z: 1.0,
      gyro_z: 1.0,
      temperature_z: 1.0,
    }
    // raw = 0.35*1 + 0.25*1 + 0.15*1 + 0.15*1 + 0 = 0.90
    // normalized = 0.90 / 3.0 = 0.30
    expect(computeCompositeRisk(zScores, 0)).toBeCloseTo(0.3)
  })

  it('includes threshold breach in computation', () => {
    const zScores: ZScores = {
      position_error_z: 0,
      accel_z: 0,
      gyro_z: 0,
      temperature_z: 0,
    }
    // raw = 0 + 0.10 * 1.0 = 0.10
    // normalized = 0.10 / 3.0 ≈ 0.0333
    expect(computeCompositeRisk(zScores, 1.0)).toBeCloseTo(0.1 / 3.0)
  })

  it('weights sum to 1.0', () => {
    // Verify: 0.35 + 0.25 + 0.15 + 0.15 + 0.10 = 1.0
    const zScores: ZScores = {
      position_error_z: 1.0,
      accel_z: 1.0,
      gyro_z: 1.0,
      temperature_z: 1.0,
    }
    // raw = 0.35 + 0.25 + 0.15 + 0.15 + 0.10 = 1.0
    // normalized = 1.0 / 3.0 ≈ 0.3333
    expect(computeCompositeRisk(zScores, 1.0)).toBeCloseTo(1.0 / 3.0)
  })

  it('clamps to 1.0 maximum', () => {
    const zScores: ZScores = {
      position_error_z: 100,
      accel_z: 100,
      gyro_z: 100,
      temperature_z: 100,
    }
    expect(computeCompositeRisk(zScores, 1.0)).toBe(1.0)
  })

  it('uses absolute values of z-scores', () => {
    const positive: ZScores = {
      position_error_z: 2.0,
      accel_z: 0,
      gyro_z: 0,
      temperature_z: 0,
    }
    const negative: ZScores = {
      position_error_z: -2.0,
      accel_z: 0,
      gyro_z: 0,
      temperature_z: 0,
    }
    expect(computeCompositeRisk(positive, 0)).toBeCloseTo(computeCompositeRisk(negative, 0))
  })
})

describe('determineRiskState', () => {
  it('returns nominal for risk < 0.50', () => {
    expect(determineRiskState(0.0)).toBe('nominal')
    expect(determineRiskState(0.25)).toBe('nominal')
    expect(determineRiskState(0.49)).toBe('nominal')
  })

  it('returns elevated for risk at exactly 0.50', () => {
    expect(determineRiskState(0.5)).toBe('elevated')
  })

  it('returns elevated for risk between 0.50 and 0.75', () => {
    expect(determineRiskState(0.6)).toBe('elevated')
    expect(determineRiskState(0.74)).toBe('elevated')
  })

  it('returns critical for risk at exactly 0.75', () => {
    expect(determineRiskState(0.75)).toBe('critical')
  })

  it('returns critical for risk above 0.75', () => {
    expect(determineRiskState(0.9)).toBe('critical')
    expect(determineRiskState(1.0)).toBe('critical')
  })
})

describe('getContributingSignals', () => {
  it('returns empty array when all z-scores are below 2.0', () => {
    const zScores: ZScores = {
      position_error_z: 1.9,
      accel_z: 0.5,
      gyro_z: 1.0,
      temperature_z: 0.1,
    }
    expect(getContributingSignals(zScores)).toEqual([])
  })

  it('includes signals with z-score above 2.0', () => {
    const zScores: ZScores = {
      position_error_z: 3.0,
      accel_z: 0.5,
      gyro_z: 0.1,
      temperature_z: 2.5,
    }
    expect(getContributingSignals(zScores)).toEqual([
      'joint_position_error_deg',
      'board_temperature_c',
    ])
  })

  it('includes signals with negative z-score with abs > 2.0', () => {
    const zScores: ZScores = {
      position_error_z: -2.5,
      accel_z: 0,
      gyro_z: 0,
      temperature_z: 0,
    }
    expect(getContributingSignals(zScores)).toEqual(['joint_position_error_deg'])
  })

  it('does not include signals at exactly 2.0', () => {
    const zScores: ZScores = {
      position_error_z: 2.0,
      accel_z: 2.0,
      gyro_z: 2.0,
      temperature_z: 2.0,
    }
    expect(getContributingSignals(zScores)).toEqual([])
  })

  it('includes all signals when all exceed 2.0', () => {
    const zScores: ZScores = {
      position_error_z: 5.0,
      accel_z: 3.0,
      gyro_z: 2.5,
      temperature_z: 4.0,
    }
    expect(getContributingSignals(zScores)).toEqual([
      'joint_position_error_deg',
      'accel_magnitude_ms2',
      'gyro_magnitude_rads',
      'board_temperature_c',
    ])
  })
})
