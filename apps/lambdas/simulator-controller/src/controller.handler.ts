import type { InvokeCommandInput, LambdaClient } from '@aws-sdk/client-lambda'
import { InvokeCommand } from '@aws-sdk/client-lambda'
import type { SimulatorWorkerPayload } from '@streaming-agents/core-contracts'
import type { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import {
  BaseLambdaHandler,
  type HandlerContext,
  type ProcessResult,
} from '@streaming-agents/lambda-base'
import { getWorkerCount } from './load-schedule.js'
import { assignScenarios } from './scenario-assigner.js'

export interface ControllerConfig {
  serviceName: string
  workerFunctionName: string
  loadScheduleJson?: string
  defaultScenario: string
}

/** EventBridge scheduled event payload (content irrelevant — only the trigger matters). */
export interface EventBridgeEvent {
  source?: string
  'detail-type'?: string
  [key: string]: unknown
}

export class SimulatorControllerHandler extends BaseLambdaHandler<
  EventBridgeEvent,
  SimulatorWorkerPayload[]
> {
  private invocationCount = 0

  constructor(
    protected readonly config: ControllerConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
    private readonly lambdaClient: LambdaClient
  ) {
    super(config, telemetry, logger)
  }

  protected async process(
    _event: EventBridgeEvent,
    _context: HandlerContext
  ): Promise<ProcessResult<SimulatorWorkerPayload[]>> {
    this.invocationCount++
    const now = new Date()
    const hour = now.getUTCHours()
    const dateStr = now.toISOString().slice(0, 10)
    const workerCount = getWorkerCount(hour, this.config.loadScheduleJson)
    const scenarios = assignScenarios(
      workerCount,
      this.config.defaultScenario as 'mixed' | 'healthy'
    )

    const payloads: SimulatorWorkerPayload[] = []
    for (let i = 0; i < workerCount; i++) {
      payloads.push({
        asset_id: `R-${i + 1}`,
        scenario: scenarios[i],
        seed: `${dateStr}:R-${i + 1}:${this.invocationCount}`,
        burst_count: 120,
      })
    }

    this.telemetry.increment('simulator.controller.invocations', {
      hour: String(hour),
      worker_count: String(workerCount),
    })

    return { status: 'success', output: payloads }
  }

  protected override async onSuccess(
    payloads: SimulatorWorkerPayload[],
    _context: HandlerContext
  ): Promise<void> {
    const invokePromises = payloads.map((payload) => {
      const input: InvokeCommandInput = {
        FunctionName: this.config.workerFunctionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(payload)),
      }
      return this.lambdaClient.send(new InvokeCommand(input))
    })

    await Promise.all(invokePromises)

    this.logger.log('Workers invoked', {
      count: payloads.length,
      scenarios: summarizeScenarios(payloads),
    })
  }
}

function summarizeScenarios(payloads: SimulatorWorkerPayload[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of payloads) {
    counts[p.scenario] = (counts[p.scenario] ?? 0) + 1
  }
  return counts
}
