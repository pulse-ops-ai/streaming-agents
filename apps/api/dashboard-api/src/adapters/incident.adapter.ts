import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { IncidentRecord } from '@streaming-agents/core-contracts'
import { createDocClient } from './dynamodb.factory.js'

@Injectable()
export class IncidentAdapter {
  private readonly docClient: DynamoDBDocumentClient
  private readonly tableName: string

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.docClient = createDocClient(config)
    this.tableName = config.get<string>('DYNAMODB_INCIDENTS_TABLE') ?? 'streaming-agents-incidents'
  }

  /** Scan for all active (opened + escalated) incidents. */
  async scanActiveIncidents(): Promise<IncidentRecord[]> {
    const response = await this.docClient.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: '#s IN (:opened, :escalated)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':opened': 'opened',
          ':escalated': 'escalated',
        },
      })
    )
    return (response.Items as IncidentRecord[]) ?? []
  }

  /** Find the active incident for a specific asset via GSI. */
  async findActiveIncidentForAsset(assetId: string): Promise<IncidentRecord | null> {
    // Check 'opened' first
    for (const status of ['opened', 'escalated'] as const) {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'asset_id-status-index',
          KeyConditionExpression: 'asset_id = :assetId AND #s = :status',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':assetId': assetId,
            ':status': status,
          },
        })
      )
      if (response.Items && response.Items.length > 0) {
        return response.Items[0] as IncidentRecord
      }
    }
    return null
  }

  /** Get a set of asset IDs that have active incidents. */
  async getAssetIdsWithActiveIncidents(): Promise<Set<string>> {
    const incidents = await this.scanActiveIncidents()
    return new Set(incidents.map((i) => i.asset_id))
  }
}
