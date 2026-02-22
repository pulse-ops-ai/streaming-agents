import { Module } from '@nestjs/common'
import { loadConfig } from '@streaming-agents/core-config'
import { KinesisProducer } from '@streaming-agents/core-kinesis'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { z } from 'zod'
import { SimulatorWorkerHandler, type WorkerConfig } from './worker.handler.js'

const WorkerConfigSchema = z.object({
  serviceName: z.string().default('simulator-worker'),
  kinesisStreamName: z.string(),
})

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): WorkerConfig => loadConfig(WorkerConfigSchema),
    },
    TelemetryService,
    LoggerService,
    {
      provide: KinesisProducer,
      useFactory: () => new KinesisProducer(),
    },
    {
      provide: SimulatorWorkerHandler,
      useFactory: (
        config: WorkerConfig,
        telemetry: TelemetryService,
        logger: LoggerService,
        producer: KinesisProducer
      ) => new SimulatorWorkerHandler(config, telemetry, logger, producer),
      inject: ['CONFIG', TelemetryService, LoggerService, KinesisProducer],
    },
  ],
})
export class SimulatorWorkerModule {}
