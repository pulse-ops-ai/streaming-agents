# History Projector Service Contract

## Service Identity

- **Name:** History Projector
- **Type:** Fan-out processor (Kinesis → DynamoDB)
- **Runtime:** Node.js 22.x on AWS Lambda
- **Package:** `apps/lambdas/history-projector/`
- **Trigger:** Kinesis Event Source Mapping on `r17-risk-events`

## Purpose

Projects `RiskEvent` from the write-side pipeline into the `asset-history` read model for dashboard time-series visualization. This is a CQRS projection — the history table is append-only, eventually consistent, and expendable.

## Input Contract

### Kinesis Event Source

**Stream:** `streaming-agents-r17-risk-events`
**Batch size:** 100 events
**Batching window:** 5 seconds
**Parallelization:** 10 concurrent batches per shard

### Event Schema: `RiskEvent`

Defined in `@streaming-agents/core-contracts`:

```typescript
interface RiskEvent {
  event_id: string
  event_type: 'risk_computed'
  timestamp: string // ISO 8601
  trace_id: string
  asset_id: string
  composite_risk: number // 0.0–1.0
  risk_state: 'nominal' | 'elevated' | 'critical'
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
  threshold_breach: number // 0.0, 0.5, or 1.0
  contributing_signals: string[]
  source_type: 'edge' | 'simulated' | 'replay'
  reading_count: number
}
```

## Output Contract

### DynamoDB Table: `streaming-agents-asset-history`

**Schema:**
```typescript
interface HistoryRow {
  asset_id: string              // PK
  timestamp: string             // SK (ISO 8601)
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
  source_type: string
  expires_at: number            // TTL epoch seconds
}
```

### DLQ: `streaming-agents-r17-risk-events-dlq`

Failed events are sent to the DLQ for manual inspection.

## Processing Logic

### Transformation

```typescript
function transformRiskEventToHistoryRow(
  event: RiskEvent,
  ttlHours: number
): HistoryRow {
  const expiresAt = Math.floor(Date.now() / 1000) + (ttlHours * 3600)

  return {
    asset_id: event.asset_id,
    timestamp: event.timestamp,
    composite_risk: event.composite_risk,
    risk_state: event.risk_state,
    z_scores: event.z_scores,
    last_values: event.last_values,
    threshold_breach: event.threshold_breach,
    contributing_signals: event.contributing_signals,
    source_type: event.source_type,
    expires_at: expiresAt
  }
}
```

### Batch Write

```typescript
async function batchWriteHistory(
  rows: HistoryRow[],
  tableName: string
): Promise<void> {
  const batches = chunk(rows, 25) // DynamoDB batch write limit

  for (const batch of batches) {
    await dynamodb.batchWriteItem({
      RequestItems: {
        [tableName]: batch.map(row => ({
          PutRequest: { Item: row }
        }))
      }
    })
  }
}
```

### Error Handling

1. **Transient errors** (DynamoDB throttling): Retry up to 3 times with exponential backoff
2. **Permanent errors** (malformed event): Send to DLQ
3. **Partial failures**: Bisect batch and retry successful subset

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | string | `dev` | Environment name |
| `KINESIS_INPUT_STREAM` | string | (required) | Input stream name |
| `DYNAMODB_HISTORY_TABLE` | string | (required) | History table name |
| `DLQ_QUEUE_URL` | string | (required) | DLQ URL for failed events |
| `TTL_HOURS` | number | `24` | TTL in hours (24 = demo, 168 = 7 days) |
| `BATCH_SIZE` | number | `25` | DynamoDB batch write size |
| `OTEL_SERVICE_NAME` | string | `history-projector` | Service name for tracing |

## IAM Permissions

### Required Policies

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KinesisReadRiskEvents",
      "Effect": "Allow",
      "Action": [
        "kinesis:GetRecords",
        "kinesis:GetShardIterator",
        "kinesis:DescribeStream",
        "kinesis:ListStreams",
        "kinesis:ListShards"
      ],
      "Resource": "arn:aws:kinesis:*:*:stream/streaming-agents-r17-risk-events"
    },
    {
      "Sid": "DynamoDBWriteHistory",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/streaming-agents-asset-history"
    },
    {
      "Sid": "SQSSendDLQ",
      "Effect": "Allow",
      "Action": ["sqs:SendMessage"],
      "Resource": "arn:aws:sqs:*:*:streaming-agents-r17-risk-events-dlq"
    },
    {
      "Sid": "XRayTracing",
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PrometheusMetrics",
      "Effect": "Allow",
      "Action": ["aps:RemoteWrite"],
      "Resource": "arn:aws:aps:*:*:workspace/*"
    }
  ]
}
```

## Observability

### Metrics (Prometheus)

- `history_projector_rows_written_total` (counter) — Total rows written to history table
- `history_projector_batch_size` (histogram) — Distribution of batch sizes
- `history_projector_processing_duration_ms` (histogram) — Processing latency per batch
- `history_projector_dlq_messages_total` (counter) — Total messages sent to DLQ

### Traces (X-Ray)

- Root span: `history-projector.handler`
- Child spans: `kinesis.getRecords`, `dynamodb.batchWriteItem`, `sqs.sendMessage`
- Trace propagation: `trace_id` from `RiskEvent` is preserved

### Logs (CloudWatch)

- Log group: `/aws/lambda/streaming-agents-history-projector`
- Log level: `INFO` (demo), `DEBUG` (troubleshooting)
- Structured JSON logs with `trace_id`, `asset_id`, `batch_size`

## Performance Characteristics

### Throughput

- **Input rate**: 12 events/s (2 Hz × 6 assets)
- **Batch size**: 100 events per invocation
- **Invocation frequency**: ~1 per 8 seconds (with 5s batching window)
- **DynamoDB writes**: 12 writes/s (well below 1,000 writes/s limit)

### Latency

- **Kinesis → Lambda**: < 500ms (ESM polling interval)
- **Lambda processing**: < 100ms (batch write)
- **End-to-end**: < 1 second (imperceptible to dashboard)

### Cost

- **Lambda invocations**: ~1,000/hour × $0.20/million = $0.005/hour
- **DynamoDB writes**: 43,200/hour × $1.25/million = $0.05/hour
- **Total**: ~$0.06/hour = $1.50/day

## Testing Strategy

### Unit Tests

```typescript
describe('HistoryProjector', () => {
  it('transforms RiskEvent to HistoryRow', () => {
    const event: RiskEvent = { /* ... */ }
    const row = transformRiskEventToHistoryRow(event, 24)
    expect(row.asset_id).toBe(event.asset_id)
    expect(row.expires_at).toBeGreaterThan(Date.now() / 1000)
  })

  it('batches rows into groups of 25', () => {
    const rows: HistoryRow[] = Array(100).fill({ /* ... */ })
    const batches = chunk(rows, 25)
    expect(batches).toHaveLength(4)
  })

  it('calculates TTL correctly', () => {
    const row = transformRiskEventToHistoryRow(event, 24)
    const expectedExpiry = Math.floor(Date.now() / 1000) + (24 * 3600)
    expect(row.expires_at).toBeCloseTo(expectedExpiry, -2)
  })
})
```

### Integration Tests (LocalStack)

```typescript
describe('HistoryProjector Integration', () => {
  it('writes to DynamoDB when RiskEvent arrives', async () => {
    // Arrange: Put RiskEvent in Kinesis
    await kinesis.putRecord({
      StreamName: 'r17-risk-events',
      Data: JSON.stringify(riskEvent),
      PartitionKey: riskEvent.asset_id
    })

    // Act: Wait for Lambda to process
    await sleep(2000)

    // Assert: Verify row in DynamoDB
    const result = await dynamodb.getItem({
      TableName: 'asset-history',
      Key: {
        asset_id: riskEvent.asset_id,
        timestamp: riskEvent.timestamp
      }
    })
    expect(result.Item).toBeDefined()
    expect(result.Item.expires_at).toBeGreaterThan(Date.now() / 1000)
  })
})
```

### E2E Tests (AWS Sandbox)

```bash
# Run simulator for 5 minutes
aws lambda invoke --function-name streaming-agents-simulator-controller

# Wait for pipeline to process
sleep 60

# Verify history table populated
aws dynamodb scan --table-name streaming-agents-asset-history --select COUNT

# Query specific asset history
aws dynamodb query \
  --table-name streaming-agents-asset-history \
  --key-condition-expression "asset_id = :id" \
  --expression-attribute-values '{":id":{"S":"R-17"}}'
```

## Dependencies

### Shared Packages

- `@streaming-agents/core-contracts` — `RiskEvent` type
- `@streaming-agents/core-config` — Environment variable validation
- `@streaming-agents/core-telemetry` — OTel SDK
- `@streaming-agents/core-kinesis` — `KinesisConsumer`, `DLQPublisher`
- `@streaming-agents/lambda-base` — `BaseLambdaHandler`, `KinesisLambdaAdapter`

### AWS Services

- **Kinesis Data Streams** — Input stream (`r17-risk-events`)
- **DynamoDB** — Output table (`asset-history`)
- **SQS** — DLQ (`r17-risk-events-dlq`)
- **CloudWatch Logs** — Structured logging
- **X-Ray** — Distributed tracing
- **Prometheus** — Custom metrics

## Deployment

### Terraform

```hcl
# infra/envs/dev/history-projector.tf
resource "aws_lambda_function" "history_projector" {
  function_name = "streaming-agents-history-projector"
  role          = aws_iam_role.history_projector.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60
  memory_size   = 256

  filename         = local.lambda_zips["history-projector"]
  source_code_hash = local.lambda_hashes["history-projector"]

  environment {
    variables = {
      NODE_ENV               = var.environment
      KINESIS_INPUT_STREAM   = module.r17_risk_events_stream.stream_name
      DYNAMODB_HISTORY_TABLE = module.asset_history_table.table_name
      DLQ_QUEUE_URL          = aws_sqs_queue.r17_risk_events_dlq.url
      TTL_HOURS              = "24"
      BATCH_SIZE             = "25"
      OTEL_SERVICE_NAME      = "history-projector"
    }
  }

  tracing_config {
    mode = "Active"
  }
}
```

### CI/CD

```yaml
# .github/workflows/lambda-deploy.yml
- name: Bundle history-projector
  run: pnpm bundle:lambda history-projector

- name: Upload to S3
  run: |
    aws s3 cp dist/history-projector.zip \
      s3://streaming-agents-artifacts/lambdas/history-projector-${{ github.sha }}.zip
```

## Operational Runbook

### Monitoring

1. **Check DLQ depth**: `aws sqs get-queue-attributes --queue-url <DLQ_URL> --attribute-names ApproximateNumberOfMessages`
2. **Check Lambda errors**: CloudWatch Metrics → Lambda → Errors
3. **Check DynamoDB throttles**: CloudWatch Metrics → DynamoDB → UserErrors

### Troubleshooting

**Symptom:** History table not populating
- Check Lambda invocations: `aws lambda get-function --function-name history-projector`
- Check ESM status: `aws lambda list-event-source-mappings --function-name history-projector`
- Check Kinesis stream: `aws kinesis describe-stream --stream-name r17-risk-events`

**Symptom:** DLQ has messages
- Inspect DLQ messages: `aws sqs receive-message --queue-url <DLQ_URL>`
- Check Lambda logs: `aws logs tail /aws/lambda/streaming-agents-history-projector --follow`
- Replay failed events: Manually put back into Kinesis stream

**Symptom:** DynamoDB throttling
- Increase batch size to reduce write frequency
- Enable DynamoDB auto-scaling (if using provisioned capacity)
- Check for hot partitions (unlikely with asset_id partition key)

## References

- Architecture: `docs/ai/architecture/dashboard-read-model.md`
- Domain model: `docs/02-domain/history-model.md`
- Dashboard API: `docs/03-apis/dashboard-api.md`
- Terraform: `infra/envs/dev/history-projector.tf`
