#!/usr/bin/env npx tsx
/**
 * Quick simulation: models EMA baseline + z-score + composite risk
 * for each scenario to find the right burst_count values.
 */

// ── EMA baseline (mirrors signal-agent/baseline.ts) ────────────
const ALPHA = 2 / (60 + 1) // window=60

interface Baseline {
  mean: number
  variance: number
  std_dev: number
}

function initBaseline(value: number): Baseline {
  return { mean: value, variance: 0, std_dev: 0 }
}

function updateBaseline(current: Baseline, newValue: number): Baseline {
  const mean = ALPHA * newValue + (1 - ALPHA) * current.mean
  const variance = ALPHA * (newValue - mean) ** 2 + (1 - ALPHA) * current.variance
  const std_dev = Math.sqrt(variance)
  return { mean, variance, std_dev }
}

// ── Risk (mirrors signal-agent/risk.ts) ────────────────────────
const MIN_STDDEV = 0.001
const THRESHOLDS = {
  board_temperature_c: { warn: 50, critical: 60 },
  accel_magnitude_ms2: { warn: 12, critical: 15 },
  gyro_magnitude_rads: { warn: 0.1, critical: 0.2 },
  joint_position_error_deg: { warn: 1.0, critical: 2.5 },
}
const WEIGHTS = {
  position_error: 0.35,
  accel: 0.25,
  gyro: 0.15,
  temperature: 0.15,
  threshold_breach: 0.1,
}

function zScore(value: number, mean: number, stdDev: number): number {
  return (value - mean) / Math.max(stdDev, MIN_STDDEV)
}

function thresholdBreach(signals: Record<string, number>): number {
  let max = 0
  for (const [sig, th] of Object.entries(THRESHOLDS)) {
    const v = signals[sig]
    if (v >= th.critical) max = Math.max(max, 1.0)
    else if (v >= th.warn) max = Math.max(max, 0.5)
  }
  return max
}

// ── Seeded PRNG (Box-Muller) ───────────────────────────────────
function mulberry32(initialSeed: number) {
  let s = initialSeed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeNoise(prng: () => number) {
  return (mean: number, std: number) => {
    const u1 = prng()
    const u2 = prng()
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }
}

// ── Scenario definitions ───────────────────────────────────────
const ONSET_TICK = 90

type ScenarioFn = (
  tick: number,
  totalTicks: number,
  noise: (m: number, s: number) => number
) => Record<string, number>

const scenarios: Record<string, ScenarioFn> = {
  // Two-phase: healthy baseline then sudden degradation
  joint_3_degradation_v2(tick, totalTicks, noise) {
    if (tick < ONSET_TICK) {
      return {
        board_temperature_c: noise(38, 2),
        accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
        gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
        joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
        control_loop_freq_hz: noise(49.5, 0.5),
      }
    }
    const degradeTicks = totalTicks - ONSET_TICK
    const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
    const baseError = 0.1 + progress * 3.4
    const baseTemp = 38 + progress * 14
    const noiseMul = 1 + progress * 0.5
    return {
      board_temperature_c: noise(baseTemp, 1 * noiseMul),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3 * noiseMul)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01 * noiseMul)),
      joint_position_error_deg: Math.abs(noise(baseError, 0.05 * noiseMul)),
      control_loop_freq_hz: noise(49.5, 0.5),
    }
  },

  vibration_anomaly_v2(tick, totalTicks, noise) {
    if (tick < ONSET_TICK) {
      return {
        board_temperature_c: noise(38, 2),
        accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
        gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
        joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
        control_loop_freq_hz: noise(49.5, 0.5),
      }
    }
    const degradeTicks = totalTicks - ONSET_TICK
    const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
    const baseAccel = 9.81 + progress * 5.19
    const baseGyro = 0.02 + progress * 0.13
    const baseError = 0.1 + progress * 0.7
    return {
      board_temperature_c: noise(38, 2),
      accel_magnitude_ms2: Math.abs(noise(baseAccel, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(baseGyro, 0.01)),
      joint_position_error_deg: Math.abs(noise(baseError, 0.05)),
      control_loop_freq_hz: noise(49.5, 0.5),
    }
  },

  thermal_runaway_v2(tick, totalTicks, noise) {
    if (tick < ONSET_TICK) {
      return {
        board_temperature_c: noise(38, 2),
        accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
        gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
        joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
        control_loop_freq_hz: noise(49.5, 0.5),
      }
    }
    const degradeTicks = totalTicks - ONSET_TICK
    const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
    const baseTemp = Math.min(80, 40 + progress * 40)
    const noiseMul = baseTemp > 55 ? Math.min(3, 1 + (baseTemp - 55) * 0.1) : 1
    const baseFreq = Math.max(4, 49.5 - progress * 45)
    return {
      board_temperature_c: noise(baseTemp, 0.5 * noiseMul),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3 * noiseMul)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01 * noiseMul)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05 * noiseMul)),
      control_loop_freq_hz: Math.max(1, noise(baseFreq, 0.5 * noiseMul)),
    }
  },

  // Original scenarios for comparison
  joint_3_degradation_orig(tick, totalTicks, noise) {
    const progress = tick / (totalTicks - 1 || 1)
    const baseError = 0.1 + progress * 3.4
    const baseTemp = 38 + progress * 14
    const noiseMul = 1 + progress * 0.5
    return {
      board_temperature_c: noise(baseTemp, 1 * noiseMul),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3 * noiseMul)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01 * noiseMul)),
      joint_position_error_deg: Math.abs(noise(baseError, 0.05 * noiseMul)),
      control_loop_freq_hz: noise(49.5, 0.5),
    }
  },
}

// ── Simulation ─────────────────────────────────────────────────
function simulate(scenarioName: string, scenarioFn: ScenarioFn, totalTicks: number) {
  const prng = mulberry32(42)
  const noise = makeNoise(prng)

  const baselines: Record<string, Baseline> = {}
  const signals = [
    'board_temperature_c',
    'accel_magnitude_ms2',
    'gyro_magnitude_rads',
    'joint_position_error_deg',
  ]

  let lastRisk = 0
  let lastState = 'nominal'
  let peakRisk = 0
  let peakTick = 0

  for (let tick = 0; tick < totalTicks; tick++) {
    const values = scenarioFn(tick, totalTicks, noise)

    // Update baselines
    for (const sig of signals) {
      if (!baselines[sig]) {
        baselines[sig] = initBaseline(values[sig])
      } else {
        baselines[sig] = updateBaseline(baselines[sig], values[sig])
      }
    }

    // Compute z-scores
    const zScores = {
      position_error_z: zScore(
        values.joint_position_error_deg,
        baselines.joint_position_error_deg.mean,
        baselines.joint_position_error_deg.std_dev
      ),
      accel_z: zScore(
        values.accel_magnitude_ms2,
        baselines.accel_magnitude_ms2.mean,
        baselines.accel_magnitude_ms2.std_dev
      ),
      gyro_z: zScore(
        values.gyro_magnitude_rads,
        baselines.gyro_magnitude_rads.mean,
        baselines.gyro_magnitude_rads.std_dev
      ),
      temperature_z: zScore(
        values.board_temperature_c,
        baselines.board_temperature_c.mean,
        baselines.board_temperature_c.std_dev
      ),
    }

    const breach = thresholdBreach(values)
    const raw =
      WEIGHTS.position_error * Math.abs(zScores.position_error_z) +
      WEIGHTS.accel * Math.abs(zScores.accel_z) +
      WEIGHTS.gyro * Math.abs(zScores.gyro_z) +
      WEIGHTS.temperature * Math.abs(zScores.temperature_z) +
      WEIGHTS.threshold_breach * breach
    const risk = Math.min(raw / 3.0, 1.0)
    const state = risk >= 0.75 ? 'critical' : risk >= 0.5 ? 'elevated' : 'nominal'

    if (risk > peakRisk) {
      peakRisk = risk
      peakTick = tick
    }

    lastRisk = risk
    lastState = state

    // Print milestone ticks
    if (tick % 30 === 0 || tick === totalTicks - 1) {
      const posErr = values.joint_position_error_deg.toFixed(2)
      const temp = values.board_temperature_c.toFixed(1)
      const accel = values.accel_magnitude_ms2.toFixed(2)
      process.stdout.write(
        `  tick ${String(tick).padStart(3)}: risk=${(risk * 100).toFixed(1).padStart(5)}% [${state.padEnd(8)}] ` +
          `posErr=${posErr} temp=${temp} accel=${accel} ` +
          `z=[pe=${zScores.position_error_z.toFixed(1)} t=${zScores.temperature_z.toFixed(1)} a=${zScores.accel_z.toFixed(1)}] ` +
          `breach=${breach}\n`
      )
    }
  }

  console.log(
    `  → FINAL: ${(lastRisk * 100).toFixed(1)}% ${lastState} | PEAK: ${(peakRisk * 100).toFixed(1)}% at tick ${peakTick}\n`
  )
  return { lastRisk, lastState, peakRisk, peakTick }
}

// ── Step-change scenarios (instant jump after baseline) ────────
function makeStepScenario(degradedValues: Partial<Record<string, number>>): ScenarioFn {
  return (tick, _totalTicks, noise) => {
    const healthy = {
      board_temperature_c: noise(38, 2),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
      control_loop_freq_hz: noise(49.5, 0.5),
    }
    if (tick < ONSET_TICK) return healthy
    // Step change: constant degraded values with some noise
    return {
      board_temperature_c: noise(degradedValues.board_temperature_c ?? 38, 2),
      accel_magnitude_ms2: Math.abs(noise(degradedValues.accel_magnitude_ms2 ?? 9.81, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(degradedValues.gyro_magnitude_rads ?? 0.02, 0.01)),
      joint_position_error_deg: Math.abs(
        noise(degradedValues.joint_position_error_deg ?? 0.1, 0.05)
      ),
      control_loop_freq_hz: noise(degradedValues.control_loop_freq_hz ?? 49.5, 0.5),
    }
  }
}

// ── Threshold Severity (proposed new component) ────────────────
function computeThresholdSeverity(signals: Record<string, number>): number {
  let maxSeverity = 0
  for (const [signal, th] of Object.entries(THRESHOLDS)) {
    const value = signals[signal]
    if (value === undefined || value === null) continue
    if (value >= th.critical) {
      const excess = (value - th.critical) / th.critical
      maxSeverity = Math.max(maxSeverity, 0.75 + Math.min(excess, 1.0) * 0.25)
    } else if (value >= th.warn) {
      const progress = (value - th.warn) / (th.critical - th.warn)
      maxSeverity = Math.max(maxSeverity, 0.5 + progress * 0.25)
    }
  }
  return Math.min(maxSeverity, 1.0)
}

// ── Enhanced simulation with threshold severity ────────────────
function simulateWithSeverity(scenarioName: string, scenarioFn: ScenarioFn, totalTicks: number) {
  const prng = mulberry32(42)
  const noise = makeNoise(prng)
  const baselines: Record<string, Baseline> = {}
  const signals = [
    'board_temperature_c',
    'accel_magnitude_ms2',
    'gyro_magnitude_rads',
    'joint_position_error_deg',
  ]

  let lastRisk = 0
  let lastState = 'nominal'

  for (let tick = 0; tick < totalTicks; tick++) {
    const values = scenarioFn(tick, totalTicks, noise)
    for (const sig of signals) {
      if (!baselines[sig]) baselines[sig] = initBaseline(values[sig])
      else baselines[sig] = updateBaseline(baselines[sig], values[sig])
    }

    const zScores = {
      position_error_z: zScore(
        values.joint_position_error_deg,
        baselines.joint_position_error_deg.mean,
        baselines.joint_position_error_deg.std_dev
      ),
      accel_z: zScore(
        values.accel_magnitude_ms2,
        baselines.accel_magnitude_ms2.mean,
        baselines.accel_magnitude_ms2.std_dev
      ),
      gyro_z: zScore(
        values.gyro_magnitude_rads,
        baselines.gyro_magnitude_rads.mean,
        baselines.gyro_magnitude_rads.std_dev
      ),
      temperature_z: zScore(
        values.board_temperature_c,
        baselines.board_temperature_c.mean,
        baselines.board_temperature_c.std_dev
      ),
    }

    const breach = thresholdBreach(values)
    const raw =
      WEIGHTS.position_error * Math.abs(zScores.position_error_z) +
      WEIGHTS.accel * Math.abs(zScores.accel_z) +
      WEIGHTS.gyro * Math.abs(zScores.gyro_z) +
      WEIGHTS.temperature * Math.abs(zScores.temperature_z) +
      WEIGHTS.threshold_breach * breach
    const zscoreRisk = Math.min(raw / 3.0, 1.0)
    const thresholdRisk = computeThresholdSeverity(values)
    const risk = Math.max(zscoreRisk, thresholdRisk)
    const state = risk >= 0.75 ? 'critical' : risk >= 0.5 ? 'elevated' : 'nominal'

    lastRisk = risk
    lastState = state

    if (tick === totalTicks - 1) {
      const posErr = values.joint_position_error_deg.toFixed(2)
      const temp = values.board_temperature_c.toFixed(1)
      const accel = values.accel_magnitude_ms2.toFixed(2)
      console.log(
        `  FINAL tick ${tick}: risk=${(risk * 100).toFixed(1)}% [${state}] ` +
          `zscore=${(zscoreRisk * 100).toFixed(1)}% severity=${(thresholdRisk * 100).toFixed(1)}% ` +
          `posErr=${posErr} temp=${temp} accel=${accel}`
      )
    }
  }
  return { lastRisk, lastState }
}

// ── Run: two-phase scenarios with threshold severity ───────────
console.log('\n=== WITH THRESHOLD SEVERITY ===\n')

// R-1: joint_3_degradation → critical (pos_error 3.5° > critical 2.5°)
for (const burst of [120, 150, 180, 240, 360]) {
  process.stdout.write(`joint_3_deg burst=${burst}: `)
  simulateWithSeverity('j3', scenarios.joint_3_degradation_v2, burst)
}

// R-2: vibration_anomaly → elevated (accel ~13, between warn=12 and critical=15)
// Need to cap accel below critical threshold
const vibScenarioCapped: ScenarioFn = (tick, totalTicks, noise) => {
  if (tick < ONSET_TICK) {
    return {
      board_temperature_c: noise(38, 2),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
      control_loop_freq_hz: noise(49.5, 0.5),
    }
  }
  const degradeTicks = totalTicks - ONSET_TICK
  const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
  // Cap accel at 13.5 (between warn=12 and critical=15)
  const baseAccel = 9.81 + progress * 3.69 // → 13.5
  const baseGyro = 0.02 + progress * 0.1 // → 0.12 (above warn=0.1)
  const baseError = 0.1 + progress * 0.4 // → 0.5 (below warn=1.0)
  return {
    board_temperature_c: noise(38, 2),
    accel_magnitude_ms2: Math.abs(noise(baseAccel, 0.3)),
    gyro_magnitude_rads: Math.abs(noise(baseGyro, 0.01)),
    joint_position_error_deg: Math.abs(noise(baseError, 0.05)),
    control_loop_freq_hz: noise(49.5, 0.5),
  }
}
console.log('')
for (const burst of [120, 150, 180, 240]) {
  process.stdout.write(`vib_capped burst=${burst}: `)
  simulateWithSeverity('vib', vibScenarioCapped, burst)
}

// R-8: thermal_runaway → elevated (temp ~55°C, between warn=50 and critical=60)
const thermalCapped: ScenarioFn = (tick, totalTicks, noise) => {
  if (tick < ONSET_TICK) {
    return {
      board_temperature_c: noise(38, 2),
      accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
      gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
      joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
      control_loop_freq_hz: noise(49.5, 0.5),
    }
  }
  const degradeTicks = totalTicks - ONSET_TICK
  const progress = (tick - ONSET_TICK) / Math.max(degradeTicks - 1, 1)
  // Temp ramps to 55°C (between warn=50, critical=60)
  const baseTemp = 38 + progress * 17 // → 55°C
  return {
    board_temperature_c: noise(baseTemp, 0.5),
    accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
    gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
    joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
    control_loop_freq_hz: Math.max(1, noise(Math.max(30, 49.5 - progress * 19.5), 0.5)),
  }
}
console.log('')
for (const burst of [120, 150, 180, 240]) {
  process.stdout.write(`thermal_capped burst=${burst}: `)
  simulateWithSeverity('therm', thermalCapped, burst)
}

// Healthy stays nominal
console.log('')
process.stdout.write('healthy burst=180: ')
simulateWithSeverity(
  'healthy',
  (tick, totalTicks, noise) => ({
    board_temperature_c: noise(38, 2),
    accel_magnitude_ms2: Math.abs(noise(9.81, 0.3)),
    gyro_magnitude_rads: Math.abs(noise(0.02, 0.01)),
    joint_position_error_deg: Math.abs(noise(0.1, 0.05)),
    control_loop_freq_hz: noise(49.5, 0.5),
  }),
  180
)
