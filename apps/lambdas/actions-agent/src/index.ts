import { bootstrapLambda } from '@streaming-agents/lambda-base'
import { ActionsAgentHandler } from './actions-agent.handler.js'
import { ActionsAgentModule } from './actions-agent.module.js'

export { ActionsAgentHandler, type ActionsAgentConfig } from './actions-agent.handler.js'
export { IncidentAdapter } from './adapters/dynamodb.adapter.js'
export { evaluateActionRules } from './rules.js'
export { buildIncidentRecord } from './incident-builder.js'

// Lambda handler export
export const handler = bootstrapLambda(ActionsAgentModule, ActionsAgentHandler)
