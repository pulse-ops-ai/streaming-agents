import { KinesisClient } from '@aws-sdk/client-kinesis'
import { Module } from '@nestjs/common'
import { KinesisProducer } from '@streaming-agents/core-kinesis'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { SimulatorWorkerHandler, type WorkerConfig } from './worker.handler.js'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): WorkerConfig => ({
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'simulator-worker',
        kinesisStreamName: requireEnv('KINESIS_STREAM_NAME'),
      }),
    },
    {
      provide: TelemetryService,
      useFactory: () => new TelemetryService(process.env.OTEL_SERVICE_NAME ?? 'simulator-worker'),
    },
    {
      provide: LoggerService,
      useFactory: () => new LoggerService(process.env.OTEL_SERVICE_NAME ?? 'simulator-worker'),
    },
    {
      provide: KinesisProducer,
      useFactory: (telemetry: TelemetryService) =>
        new KinesisProducer(
          new KinesisClient({ region: process.env.AWS_REGION }),
          requireEnv('KINESIS_STREAM_NAME'),
          telemetry,
          Number(process.env.BATCH_SIZE ?? '25')
        ),
      inject: [TelemetryService],
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
