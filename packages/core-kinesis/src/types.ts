/** A record to be written to Kinesis. */
export interface ProducerRecord {
  /** Data payload (will be JSON-serialized). */
  data: unknown
  /** Kinesis partition key (typically asset_id). */
  partitionKey: string
}

/** Result of a putRecords batch operation. */
export interface PutResult {
  /** Total records submitted across all batches. */
  total: number
  /** Records successfully written. */
  succeeded: number
  /** Records that failed after all retries. */
  failed: number
}

/** A parsed Kinesis record from a Lambda ESM event. */
export interface ParsedRecord<T> {
  data: T
  partitionKey: string
  sequenceNumber: string
  approximateArrivalTimestamp: number
}

/** Shape of a single Kinesis record in a Lambda event. */
export interface KinesisEventRecord {
  kinesis: {
    data: string // base64-encoded
    partitionKey: string
    sequenceNumber: string
    approximateArrivalTimestamp: number
  }
  eventSource: string
  eventSourceARN: string
}

/** Shape of a Kinesis stream event delivered to a Lambda function. */
export interface KinesisStreamEvent {
  Records: KinesisEventRecord[]
}

/** Options for building a DLQ message. */
export interface BuildDLQMessageOpts {
  errorCode: string
  errorMessage: string
  originalRecord: string
  sourceStream: string
  sourcePartition: string
  sourceSequence: string
  service: string
  errorDetails?: unknown
}
