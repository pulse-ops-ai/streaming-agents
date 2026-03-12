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
    increment: vi.fn(),
    timing: vi.fn(),
    gauge: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: Standard mock injection
  } as any

  const mockLogger = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: Standard mock injection
  } as any

  const router = new IntentRouter(
    mockHandlers.assetStatus,
    mockHandlers.fleetOverview,
    mockHandlers.explainRisk,
    mockHandlers.recommendAction,
    mockHandlers.acknowledge,
    mockHandlers.fallback,
    mockTelemetry,
    mockLogger
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createEvent = (intentName: string, overrides: Record<string, unknown> = {}) =>
    ({
      sessionState: {
        intent: {
          name: intentName,
          slots: { asset_id: { value: { interpretedValue: 'R-17' } } },
        },
      },
      inputTranscript: "how's R-17 doing",
      sessionId: 'test-session-123',
      inputMode: 'Speech',
      ...overrides,
      // biome-ignore lint/suspicious/noExplicitAny: Partial mock object
    }) as any

  // ──────────────────────────────────────────────────────────────────
  // Routing
  // ──────────────────────────────────────────────────────────────────

  it('routes to AssetStatusHandler and returns Lex response', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'R-17 is nominal.',
      meta: { asset_id: 'R-17', scope: 'asset', used_bedrock: false, confidence: 'matched' },
    })

    const res = await router.route(createEvent('AssetStatus'))

    expect(mockHandlers.assetStatus.handle).toHaveBeenCalled()
    expect(res.messages?.[0]?.content).toContain('17 is nominal.')
  })

  it('routes unknown intents to FallbackHandler', async () => {
    mockHandlers.fallback.handle.mockResolvedValueOnce({
      intentName: 'Unknown',
      message: 'Fallback response',
      meta: { used_bedrock: false, confidence: 'fallback' },
    })

    await router.route(createEvent('SomeRandomIntent'))
    expect(mockHandlers.fallback.handle).toHaveBeenCalled()
  })

  it('handles internal exceptions gracefully', async () => {
    mockHandlers.assetStatus.handle.mockRejectedValueOnce(new Error('DynamoDB Error'))
    const res = await router.route(createEvent('AssetStatus'))

    expect(res.messages?.[0]?.content).toContain('encountered an internal error')
    expect(res.sessionState.intent.state).toBe('Fulfilled')
  })

  // ──────────────────────────────────────────────────────────────────
  // Structured logging — Event A: conversation.request_received
  // ──────────────────────────────────────────────────────────────────

  it('emits conversation.request_received with required fields', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'OK',
      meta: { used_bedrock: false, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus'))

    const receivedCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.request_received'
    )
    expect(receivedCall).toBeDefined()

    const fields = receivedCall![1]
    expect(fields.event_name).toBe('conversation.request_received')
    expect(fields.service).toBe('conversation-agent')
    expect(fields.component).toBe('router')
    expect(fields.session_id).toBe('test-session-123')
    expect(fields.channel).toBe('voice')
    expect(fields.provider).toBe('lex')
    expect(fields.intent_name_raw).toBe('AssetStatus')
    expect(fields.fleet_scope).toBe(false)
    expect(fields.status).toBe('received')
    expect(fields.request_id).toBeDefined()
  })

  it('includes transcript_text when LOG_TRANSCRIPT is not false', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'OK',
      meta: { used_bedrock: false, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus'))

    const receivedCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.request_received'
    )
    expect(receivedCall![1].transcript_text).toBe("how's R-17 doing")
  })

  // ──────────────────────────────────────────────────────────────────
  // Structured logging — Event B: conversation.intent_resolved
  // ──────────────────────────────────────────────────────────────────

  it('emits conversation.intent_resolved with handler mapping', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'OK',
      meta: { used_bedrock: false, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus'))

    const resolvedCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.intent_resolved'
    )
    expect(resolvedCall).toBeDefined()

    const fields = resolvedCall![1]
    expect(fields.event_name).toBe('conversation.intent_resolved')
    expect(fields.intent_name_raw).toBe('AssetStatus')
    expect(fields.intent_name_resolved).toBe('AssetStatus')
    expect(fields.handler_name).toBe('AssetStatusHandler')
    expect(fields.fallback_used).toBe(false)
    expect(fields.slot_values).toEqual({ asset_id: 'R-17' })
    expect(fields.status).toBe('resolved')
  })

  it('marks fallback_used=true for unknown intents', async () => {
    mockHandlers.fallback.handle.mockResolvedValueOnce({
      intentName: 'Unknown',
      message: 'Fallback',
      meta: { used_bedrock: false, confidence: 'fallback' },
    })

    await router.route(createEvent('SomeRandomIntent'))

    const resolvedCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.intent_resolved'
    )
    expect(resolvedCall![1].fallback_used).toBe(true)
    expect(resolvedCall![1].handler_name).toBe('FallbackHandler')
    expect(resolvedCall![1].intent_name_resolved).toBe('FallbackIntent')
  })

  it('sets fleet_scope=true for FleetOverview', async () => {
    mockHandlers.fleetOverview.handle.mockResolvedValueOnce({
      intentName: 'FleetOverview',
      message: 'All nominal.',
      meta: { scope: 'fleet', used_bedrock: false, confidence: 'matched' },
    })

    await router.route(
      createEvent('FleetOverview', {
        sessionState: { intent: { name: 'FleetOverview', slots: {} } },
      })
    )

    const receivedCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.request_received'
    )
    expect(receivedCall![1].fleet_scope).toBe(true)
  })

  // ──────────────────────────────────────────────────────────────────
  // Structured logging — Event C: conversation.response_generated
  // ──────────────────────────────────────────────────────────────────

  it('emits conversation.response_generated with handler meta and token usage', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'R-17 has elevated risk due to joint position error.',
      speechContext: { severity: 'warning', intentName: 'AssetStatus', hasIncident: false },
      meta: {
        asset_id: 'R-17',
        scope: 'asset',
        used_bedrock: true,
        confidence: 'matched',
        bedrock_model_id: 'us.anthropic.claude-sonnet-4-6',
        input_tokens: 812,
        output_tokens: 143,
        total_tokens: 955,
      },
    })

    await router.route(createEvent('AssetStatus'))

    const genCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.response_generated'
    )
    expect(genCall).toBeDefined()

    const fields = genCall![1]
    expect(fields.event_name).toBe('conversation.response_generated')
    expect(fields.service).toBe('conversation-agent')
    expect(fields.intent_name_resolved).toBe('AssetStatus')
    expect(fields.used_bedrock).toBe(true)
    expect(fields.bedrock_model_id).toBe('us.anthropic.claude-sonnet-4-6')
    expect(fields.input_tokens).toBe(812)
    expect(fields.output_tokens).toBe(143)
    expect(fields.total_tokens).toBe(955)
    expect(fields.response_type).toBe('ssml')
    expect(fields.response_confidence).toBe('high')
    expect(fields.asset_id).toBe('R-17')
    expect(fields.duration_ms).toBeGreaterThanOrEqual(0)
    expect(fields.status).toBe('completed')
    expect(fields.response_summary).toBe('R-17 has elevated risk due to joint position error.')
  })

  it('omits token fields when Bedrock is not used', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'R-17 is operating normally.',
      meta: { asset_id: 'R-17', scope: 'asset', used_bedrock: false, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus'))

    const genCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.response_generated'
    )
    const fields = genCall![1]
    expect(fields.used_bedrock).toBe(false)
    expect(fields.input_tokens).toBeUndefined()
    expect(fields.output_tokens).toBeUndefined()
    expect(fields.total_tokens).toBeUndefined()
    expect(fields.bedrock_model_id).toBeUndefined()
  })

  it('truncates long response_summary to 120 chars', async () => {
    const longMessage = 'A'.repeat(200)
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: longMessage,
      meta: { used_bedrock: true, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus'))

    const genCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.response_generated'
    )
    expect(genCall![1].response_summary.length).toBeLessThanOrEqual(121) // 120 + ellipsis char
  })

  it('maps confidence no_data to medium', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'No data for R-50.',
      meta: { asset_id: 'R-50', used_bedrock: false, confidence: 'no_data' },
    })

    await router.route(createEvent('AssetStatus'))

    const genCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.response_generated'
    )
    expect(genCall![1].response_confidence).toBe('medium')
  })

  it('sets response_type to fallback for FallbackHandler', async () => {
    mockHandlers.fallback.handle.mockResolvedValueOnce({
      intentName: 'Unknown',
      message: 'Fallback',
      meta: { used_bedrock: false, confidence: 'fallback' },
    })

    await router.route(createEvent('SomeRandomIntent'))

    const genCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.response_generated'
    )
    expect(genCall![1].response_type).toBe('fallback')
    expect(genCall![1].response_confidence).toBe('low')
  })

  // ──────────────────────────────────────────────────────────────────
  // Structured logging — Event D: conversation.request_failed
  // ──────────────────────────────────────────────────────────────────

  it('emits conversation.request_failed with service and asset_id', async () => {
    mockHandlers.assetStatus.handle.mockRejectedValueOnce(new Error('DynamoDB GetItem failed'))

    await router.route(createEvent('AssetStatus'))

    const failCall = mockLogger.error.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.request_failed'
    )
    expect(failCall).toBeDefined()

    const fields = failCall![1]
    expect(fields.event_name).toBe('conversation.request_failed')
    expect(fields.service).toBe('conversation-agent')
    expect(fields.session_id).toBe('test-session-123')
    expect(fields.channel).toBe('voice')
    expect(fields.asset_id).toBe('R-17')
    expect(fields.intent_name_resolved).toBe('AssetStatus')
    expect(fields.failure_stage).toBe('dynamodb_lookup')
    expect(fields.error_message).toBe('DynamoDB GetItem failed')
    expect(fields.fallback_used).toBe(true)
    expect(fields.duration_ms).toBeGreaterThanOrEqual(0)
    expect(fields.status).toBe('failed')
  })

  it('infers bedrock_inference failure_stage from error message', async () => {
    mockHandlers.fleetOverview.handle.mockRejectedValueOnce(
      new Error('Bedrock InvokeModel timeout')
    )

    await router.route(
      createEvent('FleetOverview', {
        sessionState: { intent: { name: 'FleetOverview', slots: {} } },
      })
    )

    const failCall = mockLogger.error.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.request_failed'
    )
    expect(failCall![1].failure_stage).toBe('bedrock_inference')
    expect(failCall![1].used_bedrock).toBe(true)
  })

  it('does not emit response_generated on failure', async () => {
    mockHandlers.assetStatus.handle.mockRejectedValueOnce(new Error('Boom'))
    await router.route(createEvent('AssetStatus'))

    const genCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.response_generated'
    )
    expect(genCall).toBeUndefined()
  })

  // ──────────────────────────────────────────────────────────────────
  // Channel detection
  // ──────────────────────────────────────────────────────────────────

  it('sets channel=text for Text inputMode', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'OK',
      meta: { used_bedrock: false, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus', { inputMode: 'Text' }))

    const receivedCall = mockLogger.log.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: Test assertion
      (c: any[]) => c[0] === 'conversation.request_received'
    )
    expect(receivedCall![1].channel).toBe('text')
  })

  // ──────────────────────────────────────────────────────────────────
  // All four events emitted on success
  // ──────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────────
  // OTel metrics
  // ──────────────────────────────────────────────────────────────────

  it('emits Bedrock metrics when used_bedrock is true', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'R-17 is critical.',
      speechContext: { severity: 'critical', intentName: 'AssetStatus', hasIncident: false },
      meta: {
        asset_id: 'R-17',
        used_bedrock: true,
        confidence: 'matched',
        bedrock_model_id: 'us.anthropic.claude-sonnet-4-6',
        input_tokens: 500,
        output_tokens: 80,
        total_tokens: 580,
      },
    })

    await router.route(createEvent('AssetStatus'))

    const expectedTags = {
      intent_name_resolved: 'AssetStatus',
      model_id: 'us.anthropic.claude-sonnet-4-6',
      channel: 'voice',
    }
    expect(mockTelemetry.increment).toHaveBeenCalledWith(
      'conversation_bedrock_invocations_total',
      expectedTags
    )
    expect(mockTelemetry.timing).toHaveBeenCalledWith(
      'conversation_bedrock_duration_ms',
      expect.any(Number),
      expectedTags
    )
    expect(mockTelemetry.gauge).toHaveBeenCalledWith(
      'conversation_bedrock_input_tokens_total',
      500,
      expectedTags
    )
    expect(mockTelemetry.gauge).toHaveBeenCalledWith(
      'conversation_bedrock_output_tokens_total',
      80,
      expectedTags
    )
    expect(mockTelemetry.gauge).toHaveBeenCalledWith(
      'conversation_bedrock_total_tokens_total',
      580,
      expectedTags
    )
  })

  it('does not emit Bedrock metrics when used_bedrock is false', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'R-17 is nominal.',
      meta: { asset_id: 'R-17', used_bedrock: false, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus'))

    expect(mockTelemetry.increment).not.toHaveBeenCalled()
    expect(mockTelemetry.timing).not.toHaveBeenCalledWith(
      'conversation_bedrock_duration_ms',
      expect.any(Number),
      expect.any(Object)
    )
    expect(mockTelemetry.gauge).not.toHaveBeenCalled()
  })

  // ──────────────────────────────────────────────────────────────────
  // All events emitted on success
  // ──────────────────────────────────────────────────────────────────

  it('emits exactly 3 log events on successful request', async () => {
    mockHandlers.assetStatus.handle.mockResolvedValueOnce({
      intentName: 'AssetStatus',
      message: 'OK',
      meta: { used_bedrock: false, confidence: 'matched' },
    })

    await router.route(createEvent('AssetStatus'))

    const logCalls = mockLogger.log.mock.calls.map((c: unknown[]) => c[0])
    expect(logCalls).toEqual([
      'conversation.request_received',
      'conversation.intent_resolved',
      'conversation.response_generated',
    ])
    expect(mockLogger.error).not.toHaveBeenCalled()
  })
})
