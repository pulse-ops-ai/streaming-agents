import { Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class FallbackHandler implements IntentHandler {
  private readonly logger = new Logger(FallbackHandler.name)

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    return {
      intentName: event.sessionState.intent.name,
      message:
        "I'm not sure what you mean. Try asking about a specific robot like R-17, or ask for a fleet overview.",
    }
  }
}
