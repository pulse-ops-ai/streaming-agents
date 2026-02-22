import type { HandlerContext } from '@streaming-agents/lambda-base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ControllerConfig, SimulatorControllerHandler } from '../controller.handler.js'
import { DEFAULT_SCHEDULE, getWorkerCount } from '../load-schedule.js'
import { assignScenarios } from '../scenario-assigner.js'

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({ end: vi.fn(), setStatus: vi.fn(), recordException: vi.fn() })),
    increment: vi.fn(),
    timing: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }
}

function makeLogger() {
  return { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() }
}

function makeLambdaClient() {
  return { send: vi.fn().mockResolvedValue({ StatusCode: 202 }) }
}

const ctx: HandlerContext = { requestId: 'req-1', functionName: 'sim-ctrl' }

describe('Load Schedule', () => {
  it('returns correct worker count for each hour', () => {
    expect(getWorkerCount(0)).toBe(5)
    expect(getWorkerCount(8)).toBe(50)
    expect(getWorkerCount(12)).toBe(40)
    expect(getWorkerCount(17)).toBe(35)
    expect(getWorkerCount(23)).toBe(5)
  })

  it('uses all 24 hours in the default schedule', () => {
    for (let h = 0; h < 24; h++) {
      expect(DEFAULT_SCHEDULE[h]).toBeGreaterThan(0)
    }
  })

  it('overrides schedule via JSON', () => {
    const override = JSON.stringify({ 0: 99, 8: 1 })
    expect(getWorkerCount(0, override)).toBe(99)
    expect(getWorkerCount(8, override)).toBe(1)
  })

  it('falls back to default for missing hours in override', () => {
    const override = JSON.stringify({ 0: 99 })
    // Hour 12 not in override, falls back to default
    expect(getWorkerCount(12, override)).toBe(DEFAULT_SCHEDULE[12])
  })
})

describe('Scenario Assigner', () => {
  it('assigns all workers same scenario when not mixed', () => {
    const result = assignScenarios(10, 'healthy')
    expect(result).toHaveLength(10)
    expect(result.every((s) => s === 'healthy')).toBe(true)
  })

  it('distributes scenarios for mixed mode at ~60/15/10/10/5', () => {
    const result = assignScenarios(100, 'mixed')
    const counts: Record<string, number> = {}
    for (const s of result) counts[s] = (counts[s] ?? 0) + 1

    // 60% healthy
    expect(counts.healthy).toBe(60)
    // 15% joint_3_degradation
    expect(counts.joint_3_degradation).toBe(15)
    // 10% thermal_runaway
    expect(counts.thermal_runaway).toBe(10)
    // 10% vibration_anomaly
    expect(counts.vibration_anomaly).toBe(10)
    // 5% random_walk
    expect(counts.random_walk).toBe(5)
  })

  it('handles small worker counts gracefully', () => {
    const result = assignScenarios(1, 'mixed')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('healthy') // index 0 / 1 = 0% → healthy
  })
})

describe('SimulatorControllerHandler', () => {
  let handler: SimulatorControllerHandler
  let lambdaClient: ReturnType<typeof makeLambdaClient>
  let telemetry: ReturnType<typeof makeTelemetry>

  const config: ControllerConfig = {
    serviceName: 'simulator-controller',
    workerFunctionName: 'simulator-worker',
    defaultScenario: 'mixed',
  }

  beforeEach(() => {
    telemetry = makeTelemetry()
    lambdaClient = makeLambdaClient()
    handler = new SimulatorControllerHandler(
      config,
      telemetry as never,
      makeLogger() as never,
      lambdaClient as never
    )
  })

  it('constructs correct payload format', async () => {
    await handler.handle({}, ctx)

    // onSuccess was called through BaseLambdaHandler, check Lambda invocations
    const calls = lambdaClient.send.mock.calls
    expect(calls.length).toBeGreaterThan(0)

    // Parse first invocation payload
    const firstCall = calls[0][0]
    const payload = JSON.parse(Buffer.from(firstCall.input.Payload).toString())
    expect(payload.asset_id).toBe('R-1')
    expect(payload.burst_count).toBe(120)
    expect(payload.seed).toMatch(/^\d{4}-\d{2}-\d{2}:R-1:\d+$/)
    expect(payload.scenario).toBeDefined()
  })

  it('invokes workers with InvocationType Event (fire-and-forget)', async () => {
    await handler.handle({}, ctx)

    const firstCall = lambdaClient.send.mock.calls[0][0]
    expect(firstCall.input.InvocationType).toBe('Event')
    expect(firstCall.input.FunctionName).toBe('simulator-worker')
  })

  it('generates sequential asset IDs from R-1 to R-N', async () => {
    await handler.handle({}, ctx)

    const assetIds = lambdaClient.send.mock.calls.map((c: unknown[]) => {
      const cmd = c[0] as { input: { Payload: Uint8Array } }
      return JSON.parse(Buffer.from(cmd.input.Payload).toString()).asset_id
    })

    // All should be R-1, R-2, ..., R-N
    for (let i = 0; i < assetIds.length; i++) {
      expect(assetIds[i]).toBe(`R-${i + 1}`)
    }
  })

  it('increments invocation counter for deterministic seeds', async () => {
    await handler.handle({}, ctx)
    await handler.handle({}, ctx)

    // Second invocation should have invocationCount=2 in seeds
    const secondBatchCalls = lambdaClient.send.mock.calls
    const lastCall = secondBatchCalls[secondBatchCalls.length - 1][0]
    const payload = JSON.parse(Buffer.from(lastCall.input.Payload).toString())
    expect(payload.seed).toContain(':2')
  })

  it('uses override load schedule from config', async () => {
    const customConfig: ControllerConfig = {
      ...config,
      loadScheduleJson: JSON.stringify({
        ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, 3])),
      }),
    }
    const customHandler = new SimulatorControllerHandler(
      customConfig,
      telemetry as never,
      makeLogger() as never,
      lambdaClient as never
    )

    await customHandler.handle({}, ctx)

    // Should invoke exactly 3 workers regardless of hour
    expect(lambdaClient.send).toHaveBeenCalledTimes(3)
  })
})
