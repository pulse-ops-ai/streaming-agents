import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { KinesisClient } from '@aws-sdk/client-kinesis'
import { SQSClient } from '@aws-sdk/client-sqs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Module } from '@nestjs/common'
import { DLQPublisher, KinesisProducer } from '@streaming-agents/core-kinesis'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { BedrockAdapter } from './adapters/bedrock.adapter.js'
import { AssetStateRepository } from './adapters/dynamodb.adapter.js'
import { type DiagnosisAgentConfig, DiagnosisAgentHandler } from './diagnosis-agent.handler.js'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): DiagnosisAgentConfig => ({
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'diagnosis-agent',
        outputStreamName: requireEnv('KINESIS_OUTPUT_STREAM'),
        bedrockModelId: process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-sonnet-4-20250514',
        debounceMs: Number(process.env.DIAGNOSIS_DEBOUNCE_MS ?? '30000'),
      }),
    },
    {
      provide: TelemetryService,
      useFactory: () => new TelemetryService(process.env.OTEL_SERVICE_NAME ?? 'diagnosis-agent'),
    },
    {
      provide: LoggerService,
      useFactory: () => new LoggerService(process.env.OTEL_SERVICE_NAME ?? 'diagnosis-agent'),
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
      provide: BedrockAdapter,
      useFactory: () => {
        const region = process.env.BEDROCK_REGION ?? process.env.AWS_REGION
        return new BedrockAdapter(new BedrockRuntimeClient({ region }), {
          modelId: process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-sonnet-4-20250514',
          maxTokens: Number(process.env.BEDROCK_MAX_TOKENS ?? '1024'),
          temperature: Number(process.env.BEDROCK_TEMPERATURE ?? '0.2'),
        })
      },
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
      provide: DiagnosisAgentHandler,
      useFactory: (
        config: DiagnosisAgentConfig,
        telemetry: TelemetryService,
        logger: LoggerService,
        repository: AssetStateRepository,
        producer: KinesisProducer,
        bedrock: BedrockAdapter,
        dlq: DLQPublisher
      ) => new DiagnosisAgentHandler(config, telemetry, logger, repository, producer, bedrock, dlq),
      inject: [
        'CONFIG',
        TelemetryService,
        LoggerService,
        AssetStateRepository,
        KinesisProducer,
        BedrockAdapter,
        DLQPublisher,
      ],
    },
  ],
})
export class DiagnosisAgentModule {}
