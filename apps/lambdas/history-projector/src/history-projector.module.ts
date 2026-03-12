import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Module } from '@nestjs/common'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { HistoryRepository } from './adapters/dynamodb.adapter.js'
import {
  type HistoryProjectorConfig,
  HistoryProjectorHandler,
} from './history-projector.handler.js'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): HistoryProjectorConfig => ({
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'history-projector',
        ttlHours: Number(process.env.TTL_HOURS ?? '24'),
      }),
    },
    {
      provide: TelemetryService,
      useFactory: () => new TelemetryService(process.env.OTEL_SERVICE_NAME ?? 'history-projector'),
    },
    {
      provide: LoggerService,
      useFactory: () => new LoggerService(process.env.OTEL_SERVICE_NAME ?? 'history-projector'),
    },
    {
      provide: HistoryRepository,
      useFactory: () => {
        const client = DynamoDBDocumentClient.from(
          new DynamoDBClient({ region: process.env.AWS_REGION })
        )
        return new HistoryRepository(client, requireEnv('DYNAMODB_HISTORY_TABLE'))
      },
    },
    {
      provide: HistoryProjectorHandler,
      useFactory: (
        config: HistoryProjectorConfig,
        telemetry: TelemetryService,
        logger: LoggerService,
        repository: HistoryRepository
      ) => new HistoryProjectorHandler(config, telemetry, logger, repository),
      inject: ['CONFIG', TelemetryService, LoggerService, HistoryRepository],
    },
  ],
})
export class HistoryProjectorModule {}
