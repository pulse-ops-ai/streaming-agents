import { bootstrapLambda } from '@streaming-agents/lambda-base'
import { DiagnosisAgentHandler } from './diagnosis-agent.handler.js'
import { DiagnosisAgentModule } from './diagnosis-agent.module.js'

export { DiagnosisAgentHandler, type DiagnosisAgentConfig } from './diagnosis-agent.handler.js'
export { BedrockAdapter } from './adapters/bedrock.adapter.js'
export { AssetStateRepository } from './adapters/dynamodb.adapter.js'
export { buildDiagnosisPrompt } from './prompt.js'
export { parseDiagnosisResponse, DiagnosisResponseSchema } from './parser.js'

// Lambda handler export
export const handler = bootstrapLambda(DiagnosisAgentModule, DiagnosisAgentHandler)
