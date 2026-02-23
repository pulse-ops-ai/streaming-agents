import type { SimulatorWorkerPayload } from '@streaming-agents/core-contracts'
import type { KinesisProducer, ProducerRecord } from '@streaming-agents/core-kinesis'
import type { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import {
  BaseLambdaHandler,
  type HandlerContext,
  type ProcessResult,
} from '@streaming-agents/lambda-base'
import { buildEvent } from './event-builder.js'
import { createPRNG, gaussianNoise } from './prng.js'
import { getScenario } from './scenarios/index.js'

export interface WorkerConfig {
  serviceName: string
  kinesisStreamName: string
  /** Max jitter delay in ms before burst starts (default: 2000). Set 0 to disable. */
  maxJitterMs: number
}

export class SimulatorWorkerHandler extends BaseLambdaHandler<
  SimulatorWorkerPayload,
  ProducerRecord[]
> {
  constructor(
    protected readonly config: WorkerConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
    private readonly producer: KinesisProducer
  ) {
    super(config, telemetry, logger)
  }

  protected async process(
    payload: SimulatorWorkerPayload,
    _context: HandlerContext
  ): Promise<ProcessResult<ProducerRecord[]>> {
    const span = this.telemetry.startSpan('simulator.worker.generate', {
      'simulator.asset_id': payload.asset_id,
      'simulator.scenario': payload.scenario,
      'simulator.burst_count': payload.burst_count,
    })

    try {
      // Backpressure jitter: stagger worker starts to mimic real-world traffic
      if (this.config.maxJitterMs > 0) {
        const jitter = Math.random() * this.config.maxJitterMs
        await new Promise((resolve) => setTimeout(resolve, jitter))
      }

      const scenario = getScenario(payload.scenario)
      const prng = createPRNG(payload.seed)
      const noise = (mean: number, std: number) => gaussianNoise(prng, mean, std)
      const baseTime = new Date()
      const records: ProducerRecord[] = []

      for (let tick = 0; tick < payload.burst_count; tick++) {
        const signals = scenario.generate(tick, payload.burst_count, noise, prng)
        const event = buildEvent(signals, {
          assetId: payload.asset_id,
          baseTime,
          tick,
        })
        records.push({ data: event, partitionKey: payload.asset_id })
      }

      this.telemetry.increment('simulator.worker.events_produced', {
        scenario: payload.scenario,
      })

      return { status: 'success', output: records }
    } finally {
      span.end()
    }
  }

  protected override async onSuccess(
    records: ProducerRecord[],
    _context: HandlerContext
  ): Promise<void> {
    const startTime = Date.now()
    await this.producer.putRecords(records)
    this.telemetry.timing('simulator.worker.kinesis_put_latency_ms', Date.now() - startTime)
  }
}
