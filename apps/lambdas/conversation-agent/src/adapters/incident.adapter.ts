import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { Injectable, Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { IncidentRecord } from '@streaming-agents/core-contracts'

@Injectable()
export class IncidentAdapter {
  private readonly logger = new Logger(IncidentAdapter.name)
  private readonly docClient: DynamoDBDocumentClient
  private readonly tableName: string

  constructor(config: ConfigService) {
    const region = config.get('AWS_REGION') || 'us-east-1'
    this.tableName = config.get<string>('DYNAMODB_INCIDENTS_TABLE') ?? 'streaming-agents-incidents'

    const client = new DynamoDBClient({
      region,
      ...(config.get('NODE_ENV') === 'local' && {
        endpoint: 'http://localhost:4566',
      }),
    })
    this.docClient = DynamoDBDocumentClient.from(client)
  }

  /**
   * Finds the most recent active incident for a given asset.
   * Assumes GSI: asset_id-status-index (hash: asset_id, range: status)
   */
  async findActiveIncident(assetId: string): Promise<IncidentRecord | null> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'asset_id-status-index', // Valid per previous phase setup
      KeyConditionExpression: 'asset_id = :assetId AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':assetId': assetId,
        ':status': 'opened',
      },
    })

    const response = await this.docClient.send(command)

    // Fallback: Check 'escalated' status if no 'opened' found
    if (!response.Items || response.Items.length === 0) {
      const escalatedCommand = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'asset_id-status-index',
        KeyConditionExpression: 'asset_id = :assetId AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':assetId': assetId,
          ':status': 'escalated',
        },
      })
      const escResponse = await this.docClient.send(escalatedCommand)

      if (!escResponse.Items || escResponse.Items.length === 0) {
        return null
      }
      return escResponse.Items[0] as IncidentRecord
    }

    return response.Items[0] as IncidentRecord
  }

  /**
   * Adds an acknowledgment timestamp to the incident record.
   */
  async acknowledgeIncident(incidentId: string, timestamp: string): Promise<void> {
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { incident_id: incidentId },
      UpdateExpression: 'SET acknowledged_at = :timestamp',
      ExpressionAttributeValues: {
        ':timestamp': timestamp,
      },
      ReturnValues: 'NONE',
    })

    try {
      await this.docClient.send(command)
      this.logger.log(`Acknowledged incident ${incidentId} at ${timestamp}`)
    } catch (error) {
      this.logger.error(`Failed to acknowledge incident ${incidentId}`, error)
      throw error // Let handler handle failure
    }
  }
}
