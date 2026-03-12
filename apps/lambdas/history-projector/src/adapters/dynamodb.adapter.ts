import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

/** A single row to write to the asset-history table. */
export interface HistoryRow {
  asset_id: string
  timestamp: string
  composite_risk: number
  risk_state: string
  z_scores: {
    position_error_z: number
    accel_z: number
    gyro_z: number
    temperature_z: number
  }
  last_values: {
    board_temperature_c: number
    accel_magnitude_ms2: number
    gyro_magnitude_rads: number
    joint_position_error_deg: number
    control_loop_freq_hz: number
  }
  threshold_breach: number
  contributing_signals: string[]
  expires_at: number
}

/** DynamoDB batch writer for the asset-history table. */
export class HistoryRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  /**
   * Batch-write history rows. DynamoDB BatchWriteItem supports max 25 items,
   * so this chunks accordingly.
   */
  async batchWrite(rows: HistoryRow[]): Promise<void> {
    const BATCH_SIZE = 25
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE)
      const requestItems = {
        [this.tableName]: chunk.map((row) => ({
          PutRequest: { Item: row },
        })),
      }

      await this.docClient.send(new BatchWriteCommand({ RequestItems: requestItems }))
    }
  }
}
