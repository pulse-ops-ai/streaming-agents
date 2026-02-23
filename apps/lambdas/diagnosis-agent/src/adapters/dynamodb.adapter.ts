import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { AssetState } from '@streaming-agents/core-contracts'

export class AssetStateRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async get(assetId: string): Promise<AssetState | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { asset_id: assetId },
      })
    )
    return (result.Item as AssetState) ?? null
  }

  /** Update only the last_diagnosis_at field without overwriting the full asset state. */
  async updateDiagnosisTimestamp(assetId: string, timestamp: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { asset_id: assetId },
        UpdateExpression: 'SET last_diagnosis_at = :ts',
        ExpressionAttributeValues: { ':ts': timestamp },
      })
    )
  }
}
