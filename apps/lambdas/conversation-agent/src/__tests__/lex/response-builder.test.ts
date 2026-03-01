import { describe, expect, it } from 'vitest'
import { buildLexResponse } from '../../lex/response-builder.js'

describe('Lex V2 Response Builder', () => {
  it('builds a plain text response without SSML', () => {
    const response = buildLexResponse({
      intentName: 'TestIntent',
      message: 'Hello, world!',
    })

    expect(response.sessionState.intent.name).toBe('TestIntent')
    expect(response.sessionState.intent.state).toBe('Fulfilled')
    expect(response.sessionState.dialogAction.type).toBe('Close')
    expect(response.sessionState.sessionAttributes).toEqual({})

    expect(response.messages).toHaveLength(1)
    expect(response.messages?.[0]).toEqual({
      contentType: 'PlainText',
      content: 'Hello, world!',
    })
  })

  it('builds a response with SSML prioritizing the SSML message', () => {
    const response = buildLexResponse({
      intentName: 'TestIntent',
      message: 'Priority message.',
      ssml: '<speak>Priority <emphasis>message.</emphasis></speak>',
    })

    expect(response.messages).toHaveLength(2)
    // SSML should be the first message so Polly uses it
    expect(response.messages?.[0]).toEqual({
      contentType: 'SSML',
      content: '<speak>Priority <emphasis>message.</emphasis></speak>',
    })
    expect(response.messages?.[1]).toEqual({
      contentType: 'PlainText',
      content: 'Priority message.',
    })
  })

  it('preserves passed sessionAttributes', () => {
    const response = buildLexResponse({
      intentName: 'StatefulIntent',
      message: 'Done.',
      sessionAttributes: { key: 'value', token: '123' },
    })

    expect(response.sessionState.sessionAttributes).toEqual({
      key: 'value',
      token: '123',
    })
  })
})
