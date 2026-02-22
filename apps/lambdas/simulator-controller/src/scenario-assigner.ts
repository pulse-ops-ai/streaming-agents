import type { ScenarioName } from '@streaming-agents/core-contracts'

/**
 * Assigns scenarios to workers for mixed mode.
 * Distribution: 60% healthy, 15% joint_3_degradation, 10% thermal_runaway,
 *               10% vibration_anomaly, 5% random_walk
 */
export function assignScenarios(
  workerCount: number,
  defaultScenario: ScenarioName
): ScenarioName[] {
  if (defaultScenario !== 'mixed') {
    return Array.from({ length: workerCount }, () => defaultScenario)
  }

  const scenarios: ScenarioName[] = []
  for (let i = 0; i < workerCount; i++) {
    scenarios.push(pickScenario(i, workerCount))
  }
  return scenarios
}

function pickScenario(index: number, total: number): ScenarioName {
  const pct = index / total
  if (pct < 0.6) return 'healthy'
  if (pct < 0.75) return 'joint_3_degradation'
  if (pct < 0.85) return 'thermal_runaway'
  if (pct < 0.95) return 'vibration_anomaly'
  return 'random_walk'
}
