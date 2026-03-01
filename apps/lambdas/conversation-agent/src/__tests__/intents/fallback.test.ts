import { describe, expect, it } from 'vitest'
import { FallbackHandler } from '../../intents/fallback.handler.js'

describe('FallbackHandler', () => {
  const handler = new FallbackHandler()

  const event = {
    sessionState: { intent: { name: 'FallbackIntent' } },
  } as never

  it('returns a helpful fallback message', async () => {
    const res = await handler.handle(event)
    expect(res.intentName).toBe('FallbackIntent')
    expect(res.message).toContain('not sure what you mean')
  })

  it('does not include SSML', async () => {
    const res = await handler.handle(event)
    expect(res.ssml).toBeUndefined()
  })
})
