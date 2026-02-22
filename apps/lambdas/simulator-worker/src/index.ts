import { bootstrapLambda } from '@streaming-agents/lambda-base'
import { SimulatorWorkerHandler } from './worker.handler.js'
import { SimulatorWorkerModule } from './worker.module.js'

export { SimulatorWorkerHandler, type WorkerConfig } from './worker.handler.js'
export { buildEvent, resetSequence } from './event-builder.js'
export { createPRNG, gaussianNoise } from './prng.js'
export { getScenario } from './scenarios/index.js'
export type { NoiseFn, Scenario, SignalValues } from './scenarios/types.js'

// Lambda handler export
export const handler = bootstrapLambda(SimulatorWorkerModule, SimulatorWorkerHandler)
