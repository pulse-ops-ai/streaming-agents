import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { KinesisClient } from '@aws-sdk/client-kinesis'
import { SQSClient } from '@aws-sdk/client-sqs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Module } from '@nestjs/common'
import { DLQPublisher, KinesisProducer } from '@streaming-agents/core-kinesis'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { type ActionsAgentConfig, ActionsAgentHandler } from './actions-agent.handler.js'
import { IncidentAdapter } from './adapters/dynamodb.adapter.js'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): ActionsAgentConfig => ({
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'actions-agent',
        outputStreamName: requireEnv('KINESIS_OUTPUT_STREAM'),
        escalationThresholdMs: Number(process.env.ESCALATION_THRESHOLD_MS ?? '60000'),
        resolvedTtlHours: Number(process.env.RESOLVED_TTL_HOURS ?? '72'),
      }),
    },
    {
      provide: TelemetryService,
      useFactory: () => new TelemetryService(process.env.OTEL_SERVICE_NAME ?? 'actions-agent'),
    },
    {
      provide: LoggerService,
      useFactory: () => new LoggerService(process.env.OTEL_SERVICE_NAME ?? 'actions-agent'),
    },
    {
      provide: IncidentAdapter,
      useFactory: () => {
        const client = DynamoDBDocumentClient.from(
          new DynamoDBClient({ region: process.env.AWS_REGION })
        )
        return new IncidentAdapter(client, requireEnv('INCIDENTS_TABLE'))
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
      provide: ActionsAgentHandler,
      useFactory: (
        config: ActionsAgentConfig,
        telemetry: TelemetryService,
        logger: LoggerService,
        incidentAdapter: IncidentAdapter,
        producer: KinesisProducer,
        dlq: DLQPublisher
      ) => new ActionsAgentHandler(config, telemetry, logger, incidentAdapter, producer, dlq),
      inject: [
        'CONFIG',
        TelemetryService,
        LoggerService,
        IncidentAdapter,
        KinesisProducer,
        DLQPublisher,
      ],
    },
  ],
})
export class ActionsAgentModule {}
