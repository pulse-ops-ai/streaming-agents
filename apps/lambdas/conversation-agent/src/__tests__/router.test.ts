import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntentRouter } from '../router.js'

describe('IntentRouter', () => {
  const mockHandlers = {
    assetStatus: { handle: vi.fn() },
    fleetOverview: { handle: vi.fn() },
    explainRisk: { handle: vi.fn() },
    recommendAction: { handle: vi.fn() },
    acknowledge: { handle: vi.fn() },
    fallback: { handle: vi.fn() },
    // biome-ignore lint/suspicious/noExplicitAny: Standard mock injection
  } as any

  const mockTelemetry = {
    startSpan: vi
      .fn()
      .mockReturnValue({ setAttribute: vi.fn(), recordException: vi.fn(), end: vi.fn() }),
    // biome-ignore lint/suspicious/noExplicitAny: Standard mock injection
  } as any

  const router = new IntentRouter(
    mockHandlers.assetStatus,
    mockHandlers.fleetOverview,
    mockHandlers.explainRisk,
    mockHandlers.recommendAction,
    mockHandlers.acknowledge,
    mockHandlers.fallback,
    mockTelemetry
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createEvent = (intentName: string) =>
    ({
      sessionState: { intent: { name: intentName } },
      // biome-ignore lint/suspicious/noExplicitAny: Partial mock object
    }) as any

  it('routes to AssetStatusHandler', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      message: 'Success',
      intentName: 'AssetStatus',
    })
    const res = await router.route(createEvent('AssetStatus'))
    expect(mockHandlers.assetStatus.handle).toHaveBeenCalled()
    // messages[0] is SSML, messages[1] is PlainText
    expect(res.messages?.[1]?.content).toBe('Success')
  })

  it('routes to FallbackHandler for unknown intents', async () => {
    mockHandlers.fallback.handle.mockResolvedValueOnce({
      message: 'Fallback',
      intentName: 'Unknown',
    })
    await router.route(createEvent('SomeRandomIntent'))
    expect(mockHandlers.fallback.handle).toHaveBeenCalled()
  })

  it('handles internal routing exceptions gracefully', async () => {
    mockHandlers.assetStatus.handle.mockRejectedValueOnce(new Error('DynamoDB Error'))
    const res = await router.route(createEvent('AssetStatus'))

    // Router should catch exception and return safe message instead of crashing
    expect(res.messages?.[1]?.content).toContain('encountered an internal error')
    expect(res.sessionState.intent.state).toBe('Fulfilled') // Lex state requires fulfillment or delegate
  })
})
