import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { ConfigService } from '@nestjs/config'

/** Shared factory for DynamoDB document clients. Supports LocalStack for local dev. */
export function createDocClient(config: ConfigService): DynamoDBDocumentClient {
  const region = config.get('AWS_REGION') || 'us-east-1'
  const nodeEnv = config.get('NODE_ENV')

  const client = new DynamoDBClient({
    region,
    ...((nodeEnv === 'local' || nodeEnv === 'localstack') && {
      endpoint: config.get('LOCALSTACK_HOSTNAME')
        ? `http://${config.get('LOCALSTACK_HOSTNAME')}:4566`
        : 'http://localhost:4566',
    }),
  })

  return DynamoDBDocumentClient.from(client)
}
