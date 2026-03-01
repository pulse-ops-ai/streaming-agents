import type { LexFulfillmentResponse } from '@streaming-agents/core-contracts'

export interface ResponseInput {
  intentName: string
  message: string
  ssml?: string
  sessionAttributes?: Record<string, string>
}

/**
 * Wraps text (and optional SSML) into a standard Lex V2 Response shape.
 */
export function buildLexResponse(input: ResponseInput): LexFulfillmentResponse {
  const messages: LexFulfillmentResponse['messages'] = [
    {
      contentType: 'PlainText',
      content: input.message,
    },
  ]

  // If SSML is provided, push it as the primary response (Polly prioritizes it)
  if (input.ssml) {
    messages.unshift({
      contentType: 'SSML',
      content: input.ssml,
    })
  }

  return {
    sessionState: {
      dialogAction: {
        type: 'Close',
      },
      intent: {
        name: input.intentName,
        state: 'Fulfilled',
      },
      sessionAttributes: input.sessionAttributes ?? {},
    },
    messages,
  }
}
