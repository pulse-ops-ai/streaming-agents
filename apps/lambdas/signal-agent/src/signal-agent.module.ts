import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { KinesisClient } from '@aws-sdk/client-kinesis'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Module } from '@nestjs/common'
import { KinesisProducer } from '@streaming-agents/core-kinesis'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { AssetStateRepository } from './adapters/dynamodb.adapter.js'
import { type SignalAgentConfig, SignalAgentHandler } from './signal-agent.handler.js'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): SignalAgentConfig => ({
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'signal-agent',
        outputStreamName: requireEnv('KINESIS_OUTPUT_STREAM'),
        emaWindow: Number(process.env.EMA_WINDOW ?? '60'),
        minStdDev: Number(process.env.MIN_STDDEV ?? '0.001'),
        normalizeDivisor: Number(process.env.RISK_NORMALIZE_DIVISOR ?? '3.0'),
      }),
    },
    {
      provide: TelemetryService,
      useFactory: () => new TelemetryService(process.env.OTEL_SERVICE_NAME ?? 'signal-agent'),
    },
    {
      provide: LoggerService,
      useFactory: () => new LoggerService(process.env.OTEL_SERVICE_NAME ?? 'signal-agent'),
    },
    {
      provide: AssetStateRepository,
      useFactory: () => {
        const client = DynamoDBDocumentClient.from(
          new DynamoDBClient({ region: process.env.AWS_REGION })
        )
        return new AssetStateRepository(client, requireEnv('DYNAMODB_TABLE'))
      },
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
      provide: SignalAgentHandler,
      useFactory: (
        config: SignalAgentConfig,
        telemetry: TelemetryService,
        logger: LoggerService,
        repository: AssetStateRepository,
        producer: KinesisProducer
      ) => new SignalAgentHandler(config, telemetry, logger, repository, producer),
      inject: ['CONFIG', TelemetryService, LoggerService, AssetStateRepository, KinesisProducer],
    },
  ],
})
export class SignalAgentModule {}
