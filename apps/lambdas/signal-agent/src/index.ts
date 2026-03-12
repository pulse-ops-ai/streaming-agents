import { bootstrapLambda } from '@streaming-agents/lambda-base'
import { SignalAgentHandler } from './signal-agent.handler.js'
import { SignalAgentModule } from './signal-agent.module.js'

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
export const handler = bootstrapLambda(SignalAgentModule, SignalAgentHandler)
