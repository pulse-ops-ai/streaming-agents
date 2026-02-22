import type { KinesisStreamEvent, ParsedRecord } from './types.js'

/**
 * Deserializes Kinesis records from a Lambda ESM event.
 *
 * Base64 decodes and JSON parses each record. Throws on parse failure
 * so the handler can route the record to the DLQ.
 */
export class KinesisConsumer {
  parseRecords<T>(event: KinesisStreamEvent): ParsedRecord<T>[] {
    return event.Records.map((record) => {
      const raw = Buffer.from(record.kinesis.data, 'base64').toString('utf-8')
      const data = JSON.parse(raw) as T
      return {
        data,
        partitionKey: record.kinesis.partitionKey,
        sequenceNumber: record.kinesis.sequenceNumber,
        approximateArrivalTimestamp: record.kinesis.approximateArrivalTimestamp,
      }
    })
  }
}
