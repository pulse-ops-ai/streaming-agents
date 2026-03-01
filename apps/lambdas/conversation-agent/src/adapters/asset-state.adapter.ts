import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { Injectable } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { AssetState } from '@streaming-agents/core-contracts'

@Injectable()
export class AssetStateAdapter {
  private readonly docClient: DynamoDBDocumentClient
  private readonly tableName: string

  constructor(config: ConfigService) {
    const region = config.get('AWS_REGION') || 'us-east-1'
    this.tableName = config.get<string>('DYNAMODB_ASSET_TABLE') ?? 'streaming-agents-asset-state'

    const client = new DynamoDBClient({
      region,
      // If deployed in localstack, configure endpoint override. Handled naturally by existing SDK pattern in sandbox.
      ...(config.get('NODE_ENV') === 'local' && {
        endpoint: 'http://localhost:4566',
      }),
    })
    this.docClient = DynamoDBDocumentClient.from(client)
  }

  async getAssetState(assetId: string): Promise<AssetState | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: { asset_id: assetId },
    })

    const response = await this.docClient.send(command)
    return (response.Item as AssetState) ?? null
  }

  /**
   * Scans the table for all assets.
   * Note: In a production fleet with thousands of assets,
   * this should be replaced with a GSI query filtering only non-nominal assets.
   * For the phase 4 prototype, scanning is acceptable.
   */
  async scanAllAssets(): Promise<AssetState[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
    })

    const response = await this.docClient.send(command)
    return (response.Items as AssetState[]) ?? []
  }

  async scanNonNominalAssets(): Promise<AssetState[]> {
    const assets = await this.scanAllAssets()
    return assets.filter((a) => a.risk_state !== 'nominal')
  }
}
