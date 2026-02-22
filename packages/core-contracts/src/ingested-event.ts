import type { R17TelemetryEventV2 } from '@streaming-agents/schemas'
import type { SourceType } from './common.js'

/**
 * Wraps a validated telemetry event with trace context and Kinesis metadata.
 *
 * Stream: r17-ingested
 * Producer: Ingestion Service
 * Consumer: Signal Agent
 */
export interface IngestedEvent {
  /** UUID v4 assigned at ingestion. */
  event_id: string
  /** OTel trace ID initiated at ingestion. */
  trace_id: string
  /** ISO 8601 timestamp when the event was ingested. */
  ingested_at: string
  /** Kinesis partition key from the source record. */
  source_partition: string
  /** Kinesis sequence number from the source record. */
  source_sequence: string
  /** Origin category of the telemetry event. */
  source_type: SourceType
  /** The validated telemetry payload. */
  payload: R17TelemetryEventV2
}
