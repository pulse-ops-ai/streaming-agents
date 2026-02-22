/**
 * Standard dead-letter queue message format.
 *
 * Queue: r17-telemetry-dlq (SQS)
 * Producer: Ingestion Service
 * Consumer: Manual inspection / alerting
 */
export interface DLQMessage {
  /** Machine-readable error category. */
  error_code: string
  /** Human-readable error description. */
  error_message: string
  /** Additional error context (validation errors, stack trace, etc.). */
  error_details?: unknown
  /** Base64-encoded original Kinesis record data. */
  original_record: string
  /** Source Kinesis stream name. */
  source_stream: string
  /** Source Kinesis partition key. */
  source_partition: string
  /** Source Kinesis sequence number. */
  source_sequence: string
  /** ISO 8601 timestamp when the failure occurred. */
  failed_at: string
  /** Name of the service that sent this to the DLQ. */
  service: string
}
