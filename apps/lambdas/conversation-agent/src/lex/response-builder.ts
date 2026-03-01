import type { LexFulfillmentResponse } from '@streaming-agents/core-contracts'
import { type SpeechContext, enhanceForSpeech } from './ssml.js'

export type { SpeechContext }

export interface ResponseInput {
  intentName: string
  message: string
  speechContext?: SpeechContext
  sessionAttributes?: Record<string, string>
}

/**
 * Wraps text into a standard Lex V2 Response shape.
 * Always generates SSML via enhanceForSpeech() so every response gets
 * correct, Polly-neural-compatible SSML.
 */
export function buildLexResponse(input: ResponseInput): LexFulfillmentResponse {
  const speechContext: SpeechContext = input.speechContext ?? {
    severity: 'info',
    intentName: input.intentName,
    hasIncident: false,
  }

  const ssml = enhanceForSpeech(input.message, speechContext)

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
    messages: [
      { contentType: 'SSML', content: ssml },
      { contentType: 'PlainText', content: input.message },
    ],
  }
}
