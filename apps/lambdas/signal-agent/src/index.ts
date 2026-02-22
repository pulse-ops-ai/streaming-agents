import { SignalAgentHandler } from './signal-agent.handler.js'

export { SignalAgentHandler, type SignalAgentConfig } from './signal-agent.handler.js'
export { AssetStateRepository } from './adapters/dynamodb.adapter.js'
export { updateBaselines, initBaselines, computeAlpha } from './baseline.js'
export {
  computeZScore,
  computeThresholdBreach,
  computeCompositeRisk,
  determineRiskState,
  getContributingSignals,
} from './risk.js'

// Lambda handler export
const handlerInstance = new SignalAgentHandler()
export const handler = handlerInstance.handle.bind(handlerInstance)
