import { IngestionHandler } from './ingestion.handler.js'

export { IngestionHandler, type IngestionConfig } from './ingestion.handler.js'
export { mapSourceType } from './source-mapper.js'

// Lambda handler export
const handlerInstance = new IngestionHandler()
export const handler = handlerInstance.handle.bind(handlerInstance)
