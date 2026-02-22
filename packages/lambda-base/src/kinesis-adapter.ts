import type { HandlerContext, LambdaRuntimeContext } from './types.js'

/** Shape of a Kinesis record in a Lambda ESM event (minimal). */
interface KinesisESMRecord {
  kinesis: {
    partitionKey: string
    sequenceNumber: string
  }
  eventSourceARN: string
}

/** Shape of a Kinesis stream event from Lambda ESM trigger. */
interface KinesisESMEvent {
  Records: KinesisESMRecord[]
}

/**
 * Extracts per-record HandlerContext from a Kinesis ESM event.
 *
 * Used by ingestion and signal-agent handlers to iterate records
 * with proper context for OTel tracing and DLQ routing.
 */
export function buildKinesisContexts(
  event: KinesisESMEvent,
  lambdaContext: LambdaRuntimeContext
): HandlerContext[] {
  return event.Records.map((record) => ({
    requestId: lambdaContext.awsRequestId,
    functionName: lambdaContext.functionName,
    sourceStream: extractStreamName(record.eventSourceARN),
    sourcePartition: record.kinesis.partitionKey,
    sourceSequence: record.kinesis.sequenceNumber,
  }))
}

/** Extracts stream name from a Kinesis ARN (arn:aws:kinesis:region:account:stream/name). */
function extractStreamName(arn: string): string {
  const parts = arn.split('/')
  return parts[parts.length - 1]
}
