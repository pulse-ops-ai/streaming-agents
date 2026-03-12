import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDocClient } from './dynamodb.factory.js'

/** Raw history row shape from DynamoDB (not yet normalized to domain-models). */
export interface HistoryRow {
  asset_id: string
  timestamp: string
  composite_risk: number
  risk_state: string
  z_scores: Record<string, number>
  last_values: Record<string, number>
  threshold_breach: number
  contributing_signals?: string[]
}

@Injectable()
export class AssetHistoryAdapter {
  private readonly logger = new Logger(AssetHistoryAdapter.name)
  private readonly docClient: DynamoDBDocumentClient
  private readonly tableName: string

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.docClient = createDocClient(config)
    this.tableName =
      config.get<string>('DYNAMODB_HISTORY_TABLE') ?? 'streaming-agents-asset-history'
  }

  /** Query history points for an asset within a time window (chronological). */
  async queryHistory(assetId: string, from: string, to: string): Promise<HistoryRow[]> {
    try {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'asset_id = :id AND #ts BETWEEN :from AND :to',
          ExpressionAttributeNames: { '#ts': 'timestamp' },
          ExpressionAttributeValues: {
            ':id': assetId,
            ':from': from,
            ':to': to,
          },
          ScanIndexForward: true,
        })
      )
      return (response.Items as HistoryRow[]) ?? []
    } catch (error) {
      // History table may not exist yet — degrade gracefully
      this.logger.warn(`History query failed for ${assetId}: ${error}`)
      return []
    }
  }

  /** Query the most recent N history points for an asset (newest first). */
  async queryRecent(assetId: string, limit: number): Promise<HistoryRow[]> {
    try {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'asset_id = :id',
          ExpressionAttributeValues: { ':id': assetId },
          ScanIndexForward: false,
          Limit: limit,
        })
      )
      // Reverse to chronological order
      return ((response.Items as HistoryRow[]) ?? []).reverse()
    } catch (error) {
      this.logger.warn(`Recent history query failed for ${assetId}: ${error}`)
      return []
    }
  }
}
