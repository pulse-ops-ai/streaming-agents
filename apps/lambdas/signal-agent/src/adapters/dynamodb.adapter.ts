import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
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

  async put(state: AssetState): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: state,
      })
    )
  }
}
