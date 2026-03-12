# Dashboard Read Model Architecture

## Overview

The dashboard requires time-series data to visualize risk trends, signal degradation, and fleet health over time. The existing `asset-state` table stores only the **latest snapshot** per asset. This document defines the **history read model** — a CQRS projection that captures point-in-time snapshots for dashboard visualization.

## Architecture Pattern: CQRS Event Sourcing

```
┌─────────────────────────────────────────────────────────────────┐
│                    Write Side (Source of Truth)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Signal Agent    │
                    │  (Risk Scoring)  │
                    └────────┬─────────┘
                             │
                    ┌────────┴─────────┐
                    │                  │
                    ▼                  ▼
          ┌──────────────────┐  ┌──────────────────┐
          │  asset-state     │  │ r17-risk-events  │
          │  (DynamoDB)      │  │ (Kinesis Stream) │
          │  Latest snapshot │  │ Event log        │
          └──────────────────┘  └────────┬─────────┘
                                         │
                                         │ Fan-out
                                         ▼
                              ┌──────────────────────┐
                              │ History Projector    │
                              │ (Lambda ESM)         │
                              └──────────┬───────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Read Side (Projection)                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  asset-history (DynamoDB)                                │  │
│  │  PK: asset_id  SK: timestamp                             │  │
│  │  Append-only, TTL-enabled, eventually consistent         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│                    ┌──────────────────┐                         │
│                    │  Dashboard API   │                         │
│                    │  (Lambda URL)    │                         │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Separation of Concerns
- **Write side**: Signal Agent computes risk scores, updates `asset-state`, emits `RiskEvent`
- **Read side**: History Projector consumes `RiskEvent`, projects into `asset-history`
- **Query side**: Dashboard API reads from `asset-history` for time-series visualization

### 2. Eventual Consistency
- History table is **eventually consistent** with the write side
- Typical lag: < 1 second (Kinesis → Lambda → DynamoDB)
- Dashboard polls every 1-2 seconds, so lag is imperceptible

### 3. Expendable Projection
- History table can be **deleted and rebuilt** by replaying Kinesis streams
- Not a source of truth — just a materialized view
- TTL-enabled for automatic cleanup (24h retention for demo)

### 4. Append-Only
- No updates or deletes (except TTL expiration)
- Every risk event creates a new row
- Simplifies Lambda logic (no conditional writes)

## Infrastructure Components

### DynamoDB Table: `streaming-agents-asset-history`

**Schema:**
```typescript
interface HistoryRow {
  asset_id: string              // PK: Asset identifier (e.g., "R-17")
  timestamp: string             // SK: ISO 8601 timestamp
  composite_risk: number        // Risk score (0.0–1.0)
  risk_state: string            // "nominal" | "elevated" | "critical"
  z_scores: {                   // Per-signal z-scores
    position_error_z: number
    accel_z: number
    gyro_z: number
    temperature_z: number
  }
  last_values: {                // Raw signal values
    board_temperature_c: number
    accel_magnitude_ms2: number
    gyro_magnitude_rads: number
    joint_position_error_deg: number
    control_loop_freq_hz: number
  }
  threshold_breach: number      // 0.0, 0.5, or 1.0
  contributing_signals: string[] // Signal names with |z| > 2.0
  source_type: string           // "edge" | "simulated" | "replay"
  expires_at: number            // TTL epoch seconds
}
```

**Key Design:**
- **PK**: `asset_id` (String) — Partition by asset for efficient queries
- **SK**: `timestamp` (String, ISO 8601) — Sort key for time-series ordering

**Access Patterns:**
1. **Asset detail time series**: Query `PK = "R-17"` with `SK BETWEEN :from AND :to`
2. **Fleet snapshot**: BatchGetItem on known asset IDs with `ScanIndexForward = false, Limit = 1`
3. **Recent history**: Query `PK = "R-17"` with `ScanIndexForward = false, Limit = 60`

**Capacity:**
- **Billing mode**: PAY_PER_REQUEST (on-demand)
- **Write volume**: 2 Hz × 6 assets = 12 writes/s = 43,200 rows/hour
- **Steady state**: ~1M rows with 24h TTL (~200 MB)
- **Cost**: Within DynamoDB free tier for demo

**TTL Configuration:**
- **Attribute**: `expires_at` (Number, epoch seconds)
- **Retention**: 24 hours (demo), 7 days (extended)
- **Cleanup**: Automatic, no Lambda cost

### Lambda Function: `history-projector`

**Purpose:** Fan-out processor that consumes `RiskEvent` from Kinesis and projects into `asset-history` table.

**Trigger:** Kinesis Event Source Mapping on `r17-risk-events` stream

**Configuration:**
- **Runtime**: Node.js 22.x
- **Memory**: 256 MB
- **Timeout**: 60 seconds
- **Batch size**: 100 events
- **Batching window**: 5 seconds
- **Parallelization**: 10 concurrent batches per shard
- **Retry**: 3 attempts, bisect on error
- **DLQ**: `r17-risk-events-dlq` for failed batches

**Environment Variables:**
```bash
NODE_ENV=dev
KINESIS_INPUT_STREAM=streaming-agents-r17-risk-events
DYNAMODB_HISTORY_TABLE=streaming-agents-asset-history
DLQ_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../r17-risk-events-dlq
TTL_HOURS=24
BATCH_SIZE=25
OTEL_SERVICE_NAME=history-projector
```

**IAM Permissions:**
- `kinesis:GetRecords` on `r17-risk-events`
- `dynamodb:PutItem`, `dynamodb:BatchWriteItem` on `asset-history`
- `sqs:SendMessage` on `r17-risk-events-dlq`
- `xray:PutTraceSegments` for tracing
- `aps:RemoteWrite` for Prometheus metrics

**Processing Logic:**
1. Receive batch of `RiskEvent` from Kinesis
2. Transform each event into `HistoryRow` format
3. Calculate `expires_at = now + TTL_HOURS * 3600`
4. Batch write to DynamoDB (25 items per batch)
5. Emit OTel metrics (rows_written, batch_latency)
6. On error: send failed events to DLQ

**Error Handling:**
- **Transient errors**: Retry up to 3 times with exponential backoff
- **Permanent errors**: Send to DLQ for manual inspection
- **Partial failures**: Bisect batch and retry successful subset

### Event Source Mapping

**Configuration:**
```hcl
event_source_arn                   = module.r17_risk_events_stream.stream_arn
function_name                      = aws_lambda_function.history_projector.arn
starting_position                  = "LATEST"
batch_size                         = 100
maximum_batching_window_in_seconds = 5
parallelization_factor             = 10
maximum_retry_attempts             = 3
bisect_batch_on_function_error     = true

destination_config {
  on_failure {
    destination_arn = aws_sqs_queue.r17_risk_events_dlq.arn
  }
}
```

**Throughput:**
- **Shard count**: 1 (sufficient for 12 writes/s)
- **Parallelization**: 10 concurrent batches
- **Effective throughput**: ~1,000 events/s (far exceeds 12/s requirement)

## Data Flow

### Write Path (Signal Agent → History Table)

```
1. Signal Agent computes risk score
   ↓
2. Updates asset-state table (latest snapshot)
   ↓
3. Emits RiskEvent to r17-risk-events stream
   ↓
4. Kinesis triggers History Projector Lambda
   ↓
5. Lambda transforms RiskEvent → HistoryRow
   ↓
6. Lambda writes to asset-history table
   ↓
7. TTL expires row after 24 hours
```

**Latency:** < 1 second end-to-end (Kinesis → Lambda → DynamoDB)

### Read Path (Dashboard → History Table)

```
1. Dashboard polls /api/assets/:id/history?minutes=5
   ↓
2. Dashboard API Lambda queries asset-history
   ↓
3. DynamoDB returns time-series data points
   ↓
4. Lambda formats response as HistoryPoint[]
   ↓
5. Dashboard renders chart
```

**Query latency:** < 100ms (DynamoDB Query with SK range)

## Operational Characteristics

### Scalability
- **Write throughput**: 12 writes/s (demo), scales to 1,000+ writes/s with more shards
- **Read throughput**: Unlimited (DynamoDB on-demand scales automatically)
- **Storage**: ~200 MB with 24h TTL, ~1.4 GB with 7-day TTL

### Cost (Demo)
- **DynamoDB writes**: 43,200 writes/hour × $1.25/million = $0.05/hour = $1.20/day
- **DynamoDB storage**: 200 MB × $0.25/GB = $0.05/month
- **Lambda invocations**: ~1,000/hour × $0.20/million = $0.005/hour = $0.12/day
- **Total**: ~$1.50/day for demo, ~$45/month

### Monitoring
- **CloudWatch Metrics**: Lambda invocations, errors, duration, DynamoDB throttles
- **X-Ray Traces**: End-to-end latency from Kinesis to DynamoDB
- **Prometheus Metrics**: Custom metrics (rows_written, batch_size, ttl_expiration_count)
- **DLQ Depth**: Alert if > 0 (indicates processing failures)

### Disaster Recovery
- **Rebuild from Kinesis**: Replay `r17-risk-events` stream (24h retention)
- **Backup**: DynamoDB point-in-time recovery (disabled for demo, enable for production)
- **Data loss**: Acceptable for demo (history is expendable)

## Integration Points

### Upstream Dependencies
- **Signal Agent**: Emits `RiskEvent` to `r17-risk-events` stream
- **Kinesis Stream**: `r17-risk-events` (1 shard, 24h retention)

### Downstream Consumers
- **Dashboard API**: Queries `asset-history` for time-series visualization
- **Grafana**: (Future) Queries `asset-history` for custom dashboards

### Shared Contracts
- **RiskEvent**: Defined in `@streaming-agents/core-contracts`
- **HistoryRow**: Defined in Dashboard API service contract

## Testing Strategy

### Unit Tests
- Transform `RiskEvent` → `HistoryRow`
- Calculate `expires_at` correctly
- Batch DynamoDB writes (25 items per batch)
- Handle partial failures

### Integration Tests (LocalStack)
- Write `RiskEvent` to Kinesis
- Verify Lambda triggered
- Verify row written to DynamoDB
- Verify TTL attribute set correctly

### E2E Tests (AWS Sandbox)
- Run simulator for 5 minutes
- Verify history table populated
- Query history via Dashboard API
- Verify TTL cleanup after 24 hours

## Future Enhancements

### Phase 6+ (Post-Demo)
1. **Aggregation**: Pre-compute 1-minute, 5-minute, 1-hour rollups for faster queries
2. **Compression**: Store z-scores as binary instead of JSON for 50% size reduction
3. **Archival**: Export to S3 after 7 days for long-term analysis
4. **Replay**: Add Lambda to rebuild history from Kinesis stream on-demand
5. **Multi-region**: Replicate history table to secondary region for DR

## References

- [DynamoDB TTL Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [Lambda Event Source Mapping](https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
