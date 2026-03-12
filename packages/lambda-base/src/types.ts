/** Result of processing a single event in a Lambda handler. */
export type ProcessResult<TOut> =
  | { status: 'success'; output?: TOut }
  | { status: 'skip'; reason: string }
  | { status: 'retry'; reason: string }
  | { status: 'dlq'; reason: string; error: Error }

/** Context propagated through the handler lifecycle. */
export interface HandlerContext {
  /** Lambda request ID. */
  requestId: string
  /** Lambda function name. */
  functionName: string
  /** Propagated OTel trace ID. */
  traceId?: string
  /** Kinesis stream name (if applicable). */
  sourceStream?: string
  /** Kinesis partition key. */
  sourcePartition?: string
  /** Kinesis sequence number. */
  sourceSequence?: string
}

/** Minimal config required by BaseLambdaHandler. */
export interface LambdaConfig {
  serviceName: string
}

/** Minimal Lambda Context (avoids @types/aws-lambda dependency). */
export interface LambdaRuntimeContext {
  awsRequestId: string
  functionName: string
}
