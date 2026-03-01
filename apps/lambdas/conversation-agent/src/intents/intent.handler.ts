import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import type { ResponseInput } from '../lex/response-builder.js'

export interface IntentHandler {
  handle(event: LexFulfillmentRequest): Promise<ResponseInput>
}
