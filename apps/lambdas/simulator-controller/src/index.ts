import { SimulatorControllerHandler } from './controller.handler.js'

export {
  SimulatorControllerHandler,
  type ControllerConfig,
  type EventBridgeEvent,
} from './controller.handler.js'
export { getWorkerCount, DEFAULT_SCHEDULE } from './load-schedule.js'
export { assignScenarios } from './scenario-assigner.js'

// Lambda handler export
const handlerInstance = new SimulatorControllerHandler()
export const handler = handlerInstance.handle.bind(handlerInstance)
