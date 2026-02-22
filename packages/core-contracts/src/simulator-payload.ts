import type { ScenarioName } from './common.js'

/**
 * Payload sent from Simulator Controller to Simulator Worker via Lambda invoke.
 */
export interface SimulatorWorkerPayload {
  /** Target asset identifier (e.g., "R-17"). */
  asset_id: string
  /** Degradation scenario to simulate. */
  scenario: ScenarioName
  /** Deterministic seed for reproducibility. */
  seed: string
  /** Number of events to generate (default 120 = 60s at 2 Hz). */
  burst_count: number
}
