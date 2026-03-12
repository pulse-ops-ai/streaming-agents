import { afterEach, describe, expect, it, vi } from 'vitest'

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  InvokeModelCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

import { LiveBedrockAdapter } from '../../adapters/live-bedrock.adapter.js'

describe('LiveBedrockAdapter', () => {
  const mockConfig = {
    get: vi.fn((key: string, defaultVal?: string) => {
      const values: Record<string, string> = {
        BEDROCK_REGION: 'us-east-1',
        BEDROCK_MODEL_ID: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      }
      return values[key] ?? defaultVal
    }),
  } as never

  const mockTelemetry = {
    startSpan: vi.fn().mockReturnValue({
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    }),
  } as never

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('invokes Bedrock and returns BedrockResponse with usage', async () => {
    const adapter = new LiveBedrockAdapter(mockConfig, mockTelemetry)

    const responseBody = {
      content: [{ text: 'The temperature is high.' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }
    mockSend.mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify(responseBody)),
    })

    const result = await adapter.generateResponse('system prompt', 'user context')
    expect(result.text).toBe('The temperature is high.')
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50, total_tokens: 150 })
    expect(result.model_id).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0')
    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('returns fallback text when content is missing', async () => {
    const adapter = new LiveBedrockAdapter(mockConfig, mockTelemetry)

    const responseBody = { content: [], usage: {} }
    mockSend.mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify(responseBody)),
    })

    const result = await adapter.generateResponse('system prompt', 'user context')
    expect(result.text).toBe('I experienced an error generating a response.')
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0, total_tokens: 0 })
  })

  it('throws and records exception on SDK error', async () => {
    const adapter = new LiveBedrockAdapter(mockConfig, mockTelemetry)
    mockSend.mockRejectedValueOnce(new Error('Bedrock unavailable'))

    await expect(adapter.generateResponse('system prompt', 'user context')).rejects.toThrow(
      'Bedrock unavailable'
    )

    const span = mockTelemetry.startSpan.mock.results[0].value
    expect(span.recordException).toHaveBeenCalled()
    expect(span.end).toHaveBeenCalled()
  })
})
