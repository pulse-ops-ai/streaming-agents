/**
 * Amazon Lex V2 Fulfillment Request format.
 * Sent synchronously to the fulfillment Lambda when an intent is resolved.
 */
export interface LexFulfillmentRequest {
  messageVersion: string
  invocationSource: 'FulfillmentCodeHook' | string
  sessionState: {
    intent: {
      name: string
      slots: Record<
        string,
        {
          value: {
            interpretedValue?: string
            originalValue?: string
            resolvedValues?: string[]
          }
        } | null
      >
      state: string
    }
    sessionAttributes?: Record<string, string>
  }
  inputTranscript: string
}

/**
 * Amazon Lex V2 Fulfillment Response format.
 * Returned synchronously by the fulfillment Lambda.
 */
export interface LexFulfillmentResponse {
  sessionState: {
    dialogAction: {
      type: 'Close' | 'Delegate' | 'ElicitSlot' | 'ElicitIntent'
    }
    intent: {
      name: string
      state: 'Fulfilled' | 'Failed' | 'InProgress'
    }
    sessionAttributes?: Record<string, string>
  }
  messages?: Array<{
    contentType: 'PlainText' | 'SSML' | 'CustomPayload'
    content: string
  }>
}
