import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDocClient } from './dynamodb.factory.js'

@Injectable()
export class AssetStateAdapter {
  private readonly docClient: DynamoDBDocumentClient
  private readonly tableName: string

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.docClient = createDocClient(config)
    this.tableName = config.get<string>('DYNAMODB_ASSET_TABLE') ?? 'streaming-agents-asset-state'
  }

  async getAsset(assetId: string): Promise<Record<string, unknown> | null> {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { asset_id: assetId },
      })
    )
    return (response.Item as Record<string, unknown>) ?? null
  }

  async scanAllAssets(): Promise<Record<string, unknown>[]> {
    const response = await this.docClient.send(new ScanCommand({ TableName: this.tableName }))
    return (response.Items as Record<string, unknown>[]) ?? []
  }
}
