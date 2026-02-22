import { bootstrapLambda } from '@streaming-agents/lambda-base'
import { IngestionHandler } from './ingestion.handler.js'
import { IngestionModule } from './ingestion.module.js'

export { IngestionHandler, type IngestionConfig } from './ingestion.handler.js'
export { mapSourceType } from './source-mapper.js'

// Lambda handler export
export const handler = bootstrapLambda(IngestionModule, IngestionHandler)
