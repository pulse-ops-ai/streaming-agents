import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LambdaRuntimeContext } from '../types.js'

// Mock NestJS before importing bootstrap
const mockGet = vi.fn()
const mockCreateApplicationContext = vi.fn().mockResolvedValue({ get: mockGet })

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: mockCreateApplicationContext,
  },
}))

vi.mock('@streaming-agents/core-telemetry', () => ({
  initOtel: vi.fn(),
}))

// Import after mocks are set up
const { bootstrapLambda } = await import('../bootstrap.js')
const { initOtel } = await import('@streaming-agents/core-telemetry')

const lambdaContext: LambdaRuntimeContext = {
  awsRequestId: 'req-001',
  functionName: 'my-lambda',
}

describe('bootstrapLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset by re-importing would be complex; instead we test first-call vs second-call
  })

  it('creates NestJS context on first invocation', async () => {
    const mockHandle = vi.fn().mockResolvedValue(undefined)
    mockGet.mockReturnValue({ handle: mockHandle })

    class FakeModule {}
    class FakeHandler {}

    const handler = bootstrapLambda(FakeModule as never, FakeHandler as never)
    await handler('test-event', lambdaContext)

    expect(mockCreateApplicationContext).toHaveBeenCalledWith(FakeModule, { logger: false })
    expect(mockGet).toHaveBeenCalledWith(FakeHandler)
    expect(mockHandle).toHaveBeenCalledWith('test-event', {
      requestId: 'req-001',
      functionName: 'my-lambda',
    })
  })

  it('initializes OTel before NestJS bootstrap', async () => {
    const callOrder: string[] = []
    mockCreateApplicationContext.mockImplementation(async () => {
      callOrder.push('nestjs')
      return { get: mockGet }
    })
    ;(initOtel as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('otel')
    })
    mockGet.mockReturnValue({ handle: vi.fn().mockResolvedValue(undefined) })

    class M {}
    class H {}
    const handler = bootstrapLambda(M as never, H as never)
    await handler('event', lambdaContext)

    expect(callOrder).toEqual(['otel', 'nestjs'])
  })

  it('reuses NestJS context on warm invocation', async () => {
    mockGet.mockReturnValue({ handle: vi.fn().mockResolvedValue(undefined) })

    class M {}
    class H {}
    const handler = bootstrapLambda(M as never, H as never)

    await handler('event-1', lambdaContext)
    await handler('event-2', lambdaContext)

    // createApplicationContext called only once (cold start)
    expect(mockCreateApplicationContext).toHaveBeenCalledTimes(1)
    // get called twice (once per invocation)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('uses OTEL_SERVICE_NAME env var for service name', async () => {
    const prev = process.env.OTEL_SERVICE_NAME
    process.env.OTEL_SERVICE_NAME = 'custom-service'

    mockGet.mockReturnValue({ handle: vi.fn().mockResolvedValue(undefined) })

    class M {}
    class H {}
    const handler = bootstrapLambda(M as never, H as never)
    await handler('event', lambdaContext)

    expect(initOtel).toHaveBeenCalledWith('custom-service')

    if (prev !== undefined) {
      process.env.OTEL_SERVICE_NAME = prev
    } else {
      Reflect.deleteProperty(process.env, 'OTEL_SERVICE_NAME')
    }
  })
})
