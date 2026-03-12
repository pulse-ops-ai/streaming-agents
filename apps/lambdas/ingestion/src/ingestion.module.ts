import { KinesisClient } from '@aws-sdk/client-kinesis'
import { SQSClient } from '@aws-sdk/client-sqs'
import { Module } from '@nestjs/common'
import { DLQPublisher, KinesisProducer } from '@streaming-agents/core-kinesis'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { type IngestionConfig, IngestionHandler } from './ingestion.handler.js'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): IngestionConfig => ({
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'ingestion',
        inputStreamName: requireEnv('KINESIS_INPUT_STREAM'),
        outputStreamName: requireEnv('KINESIS_OUTPUT_STREAM'),
        batchParallelism: Number(process.env.BATCH_PARALLELISM ?? '5'),
      }),
    },
    {
      provide: TelemetryService,
      useFactory: () => new TelemetryService(process.env.OTEL_SERVICE_NAME ?? 'ingestion'),
    },
    {
      provide: LoggerService,
      useFactory: () => new LoggerService(process.env.OTEL_SERVICE_NAME ?? 'ingestion'),
    },
    {
      provide: KinesisProducer,
      useFactory: (telemetry: TelemetryService) =>
        new KinesisProducer(
          new KinesisClient({ region: process.env.AWS_REGION }),
          requireEnv('KINESIS_OUTPUT_STREAM'),
          telemetry
        ),
      inject: [TelemetryService],
    },
    {
      provide: DLQPublisher,
      useFactory: (telemetry: TelemetryService) =>
        new DLQPublisher(
          new SQSClient({ region: process.env.AWS_REGION }),
          requireEnv('DLQ_QUEUE_URL'),
          telemetry
        ),
      inject: [TelemetryService],
    },
    {
      provide: IngestionHandler,
      useFactory: (
        config: IngestionConfig,
        telemetry: TelemetryService,
        logger: LoggerService,
        producer: KinesisProducer,
        dlq: DLQPublisher
      ) => new IngestionHandler(config, telemetry, logger, producer, dlq),
      inject: ['CONFIG', TelemetryService, LoggerService, KinesisProducer, DLQPublisher],
    },
  ],
})
export class IngestionModule {}
