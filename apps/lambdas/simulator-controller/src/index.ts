import { bootstrapLambda } from '@streaming-agents/lambda-base'
import { SimulatorControllerHandler } from './controller.handler.js'
import { SimulatorControllerModule } from './controller.module.js'

export {
  SimulatorControllerHandler,
  type ControllerConfig,
  type EventBridgeEvent,
} from './controller.handler.js'
export { getWorkerCount, DEFAULT_SCHEDULE } from './load-schedule.js'
export { assignScenarios } from './scenario-assigner.js'

// Lambda handler export
export const handler = bootstrapLambda(SimulatorControllerModule, SimulatorControllerHandler)
