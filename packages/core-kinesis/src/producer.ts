import type { KinesisClient, PutRecordsRequestEntry } from '@aws-sdk/client-kinesis'
import { PutRecordsCommand } from '@aws-sdk/client-kinesis'
import type { TelemetryService } from '@streaming-agents/core-telemetry'
import type { ProducerRecord, PutResult } from './types.js'

const MAX_BATCH_SIZE = 500
const DEFAULT_BATCH_SIZE = 25
const MAX_RETRIES = 3
const BASE_DELAY_MS = 100

export class KinesisProducer {
  private readonly batchSize: number

  constructor(
    private readonly client: KinesisClient,
    private readonly streamName: string,
    private readonly telemetry: TelemetryService,
    batchSize = DEFAULT_BATCH_SIZE
  ) {
    this.batchSize = Math.min(Math.max(batchSize, 1), MAX_BATCH_SIZE)
  }

  async putRecords(records: ProducerRecord[]): Promise<PutResult> {
    const result: PutResult = { total: records.length, succeeded: 0, failed: 0 }
    const chunks = this.chunk(records, this.batchSize)

    for (const chunk of chunks) {
      const batchResult = await this.putBatch(chunk)
      result.succeeded += batchResult.succeeded
      result.failed += batchResult.failed
    }

    return result
  }

  private async putBatch(
    records: ProducerRecord[]
  ): Promise<{ succeeded: number; failed: number }> {
    const span = this.telemetry.startSpan('kinesis.put_records', {
      'kinesis.stream': this.streamName,
      'kinesis.record_count': records.length,
    })

    let entries = this.toEntries(records)
    let attempt = 0
    let succeeded = 0

    try {
      while (entries.length > 0 && attempt < MAX_RETRIES) {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * 2 ** (attempt - 1)
          await sleep(delay)
        }

        const response = await this.client.send(
          new PutRecordsCommand({
            StreamName: this.streamName,
            Records: entries,
          })
        )

        const resultRecords = response.Records ?? []
        const failedEntries: PutRecordsRequestEntry[] = []

        for (let i = 0; i < resultRecords.length; i++) {
          if (resultRecords[i].ErrorCode) {
            failedEntries.push(entries[i])
          } else {
            succeeded++
          }
        }

        entries = failedEntries
        attempt++
      }

      const failed = entries.length
      this.telemetry.increment('kinesis.records_written', { stream: this.streamName })
      return { succeeded, failed }
    } catch (error) {
      span.recordException(error as Error)
      return { succeeded, failed: entries.length + (records.length - succeeded - entries.length) }
    } finally {
      span.end()
    }
  }

  private toEntries(records: ProducerRecord[]): PutRecordsRequestEntry[] {
    return records.map((r) => ({
      Data: Buffer.from(JSON.stringify(r.data)),
      PartitionKey: r.partitionKey,
    }))
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size))
    }
    return chunks
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
