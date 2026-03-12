import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { IncidentRecord } from '@streaming-agents/core-contracts'

export class IncidentAdapter {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly indexName = 'asset_id-status-index'
  ) {}

  /**
   * Find the active (non-resolved) incident for an asset.
   * Queries the GSI for 'opened' and 'escalated' statuses,
   * returns the most recently updated if multiple exist.
   */
  async findActiveIncident(assetId: string): Promise<IncidentRecord | null> {
    const results = await Promise.all([
      this.queryByStatus(assetId, 'opened'),
      this.queryByStatus(assetId, 'escalated'),
    ])

    const incidents = [...results[0], ...results[1]]
    if (incidents.length === 0) return null

    // Return most recently updated if multiple exist (defensive)
    incidents.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return incidents[0]
  }

  async saveIncident(record: IncidentRecord): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      })
    )
  }

  private async queryByStatus(assetId: string, status: string): Promise<IncidentRecord[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: this.indexName,
        KeyConditionExpression: 'asset_id = :aid AND #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':aid': assetId, ':status': status },
      })
    )
    return (result.Items as IncidentRecord[]) ?? []
  }
}
