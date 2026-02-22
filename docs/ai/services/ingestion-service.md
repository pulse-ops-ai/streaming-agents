# Service Contract: Ingestion Service

## Identity
- **Service:** `ingestion`
- **Location:** `apps/lambdas/ingestion/`
- **Runtime:** NestJS on AWS Lambda
- **Trigger:** Kinesis stream `r17-telemetry` (event source mapping)
- **Phase:** 2.6

## Purpose

Single entry point for all telemetry regardless of source (edge exporter,
simulator, replay harness). Validates schema, enriches metadata, initiates
OTel traces, and fans out to downstream consumers.

This is the **gateway** — nothing downstream should ever read from Kinesis directly.

## What It Receives

Kinesis event batch containing one or more `R17TelemetryV2Event` records.

Each record is a JSON-encoded telemetry event from any producer.

## What It Does

For each record in the Kinesis batch:

1. **Deserialize** — Parse JSON from Kinesis record data (base64 decoded)
2. **Schema Validation** — Validate against `R17TelemetryV2Event` Zod schema
   - If invalid → publish to DLQ (`r17-telemetry-dlq` SQS queue) with error details
   - If valid → continue
3. **OTel Trace Initiation** — Create a new trace span for this event
   - Span name: `ingestion.process`
   - Set `trace_id` on the enriched event (propagated downstream)
   - Attributes: `asset_id`, `source.type`, `schema_version`
4. **Metadata Enrichment** — Wrap the validated event in an ingestion envelope:
   ```typescript
   interface IngestedEvent {
     event_id: string;          // UUID v4
     trace_id: string;          // OTel trace ID
     ingested_at: string;       // ISO 8601 timestamp
     source_partition: string;  // Kinesis partition key
     source_sequence: string;   // Kinesis sequence number
     source_type: 'edge' | 'simulated' | 'replay';  // from event.source.type
     payload: R17TelemetryV2Event;  // the original validated event
   }
   ```
5. **Fan-out** — Write the enriched event to the downstream Kinesis stream
   `r17-ingested` (partition key: `asset_id`)

## What It Emits

`IngestedEvent` to Kinesis stream `r17-ingested`.

## What It Must NOT Do

- Must NOT compute risk scores or baselines
- Must NOT write to DynamoDB
- Must NOT modify the original telemetry payload (only wrap it)
- Must NOT drop valid events silently — every event either fans out or goes to DLQ
- Must NOT create incidents or alerts

## Error Handling

| Error Type | Action |
|-----------|--------|
| JSON parse failure | → DLQ with `error_code: PARSE_FAILED` |
| Schema validation failure | → DLQ with `error_code: SCHEMA_INVALID`, include Zod errors |
| Kinesis write failure (downstream) | Retry 3x with exponential backoff, then → DLQ |
| Unknown error | → DLQ with `error_code: UNKNOWN`, include stack trace |

DLQ message format:
```typescript
interface DLQMessage {
  error_code: string;
  error_message: string;
  error_details?: unknown;     // Zod errors, stack trace, etc.
  original_record: string;     // base64 of original Kinesis data
  source_stream: string;       // "r17-telemetry"
  source_partition: string;
  source_sequence: string;
  failed_at: string;           // ISO 8601
  service: string;             // "ingestion"
}
```

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KINESIS_INPUT_STREAM` | yes | — | Source stream (r17-telemetry) |
| `KINESIS_OUTPUT_STREAM` | yes | — | Fan-out stream (r17-ingested) |
| `DLQ_QUEUE_URL` | yes | — | SQS DLQ URL |
| `AWS_REGION` | yes | — | AWS region |
| `OTEL_SERVICE_NAME` | no | `ingestion` | OTel service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTLP collector endpoint |
| `BATCH_PARALLELISM` | no | `5` | Max concurrent record processing |

## Dependencies

- `@streaming-agents/schemas` — R17TelemetryV2Event Zod schema for validation
- `@streaming-agents/core-contracts` — IngestedEvent envelope type
- `@streaming-agents/core-config` — validated env config
- `@streaming-agents/core-telemetry` — OTel trace initiation
- `@streaming-agents/core-kinesis` — Kinesis consumer/producer + DLQ helper
- `@streaming-agents/lambda-base` — BaseLambdaHandler

## OTel Instrumentation

- Span: `ingestion.process` (one per record)
  - `telemetry.asset_id`
  - `telemetry.source_type`
  - `telemetry.schema_version`
  - `ingestion.event_id`
- Span: `ingestion.validate` (child of process)
- Span: `ingestion.fanout` (child of process)
- Metric: `ingestion.events_processed` (counter, tags: source_type, valid/invalid)
- Metric: `ingestion.validation_errors` (counter, tags: error_code)
- Metric: `ingestion.latency_ms` (histogram, tags: source_type)
- Metric: `ingestion.dlq_sent` (counter, tags: error_code)

## Kinesis Event Source Mapping

```hcl
resource "aws_lambda_event_source_mapping" "ingestion_kinesis" {
  event_source_arn  = aws_kinesis_stream.r17_telemetry.arn
  function_name     = aws_lambda_function.ingestion.arn
  starting_position = "LATEST"
  batch_size        = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor = 10
  maximum_retry_attempts = 3
  bisect_batch_on_function_error = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.r17_telemetry_dlq.arn
    }
  }
}
```
