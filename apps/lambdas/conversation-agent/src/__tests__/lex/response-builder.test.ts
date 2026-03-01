import { describe, expect, it } from 'vitest'
import { buildLexResponse } from '../../lex/response-builder.js'

describe('Lex V2 Response Builder', () => {
  it('always produces SSML and PlainText messages', () => {
    const response = buildLexResponse({
      intentName: 'TestIntent',
      message: 'Hello, world!',
    })

    expect(response.sessionState.intent.name).toBe('TestIntent')
    expect(response.sessionState.intent.state).toBe('Fulfilled')
    expect(response.sessionState.dialogAction.type).toBe('Close')
    expect(response.sessionState.sessionAttributes).toEqual({})

    expect(response.messages).toHaveLength(2)
    expect(response.messages?.[0]?.contentType).toBe('SSML')
    expect(response.messages?.[0]?.content).toMatch(/^<speak>/)
    expect(response.messages?.[1]).toEqual({
      contentType: 'PlainText',
      content: 'Hello, world!',
    })
  })

  it('defaults to info severity when speechContext is omitted', () => {
    const response = buildLexResponse({
      intentName: 'TestIntent',
      message: 'Everything is fine.',
    })

    const ssml = response.messages?.[0]?.content ?? ''
    // Info severity: no emphasis, no break
    expect(ssml).toBe('<speak>Everything is fine.</speak>')
  })

  it('applies critical emphasis when speechContext has critical severity', () => {
    const response = buildLexResponse({
      intentName: 'ExplainRisk',
      message: 'Pressure seal failure detected. Shutdown recommended.',
      speechContext: { severity: 'critical', intentName: 'ExplainRisk', hasIncident: true },
    })

    const ssml = response.messages?.[0]?.content ?? ''
    expect(ssml).toContain('<emphasis level="strong">')
    expect(ssml).toContain('<break time="400ms"/>')
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
