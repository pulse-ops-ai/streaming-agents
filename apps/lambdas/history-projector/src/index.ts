import { bootstrapLambda } from '@streaming-agents/lambda-base'
import { HistoryProjectorHandler } from './history-projector.handler.js'
import { HistoryProjectorModule } from './history-projector.module.js'

export { HistoryProjectorHandler } from './history-projector.handler.js'
export type { HistoryProjectorConfig } from './history-projector.handler.js'
export { HistoryRepository, type HistoryRow } from './adapters/dynamodb.adapter.js'

// Lambda handler export
export const handler = bootstrapLambda(HistoryProjectorModule, HistoryProjectorHandler)
