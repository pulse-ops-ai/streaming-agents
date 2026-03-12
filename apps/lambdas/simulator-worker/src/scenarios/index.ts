import { healthyScenario } from './healthy.js'
import { joint3DegradationScenario } from './joint-3-degradation.js'
import { randomWalkScenario } from './random-walk.js'
import { thermalRunawayScenario } from './thermal-runaway.js'
import type { Scenario } from './types.js'
import { vibrationAnomalyScenario } from './vibration-anomaly.js'

const SCENARIO_REGISTRY: Record<string, Scenario> = {
  healthy: healthyScenario,
  joint_3_degradation: joint3DegradationScenario,
  thermal_runaway: thermalRunawayScenario,
  vibration_anomaly: vibrationAnomalyScenario,
  random_walk: randomWalkScenario,
}

export function getScenario(name: string): Scenario {
  const scenario = SCENARIO_REGISTRY[name]
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`)
  }
  return scenario
}

export type { NoiseFn, Scenario, SignalValues } from './types.js'
