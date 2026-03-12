# History Read Model

## Purpose

The pipeline's current DynamoDB tables (`asset-state`, `incidents`) store only the **latest state** per asset. The dashboard mockups require time-series data — composite risk climbing over 60 seconds, per-signal charts showing degradation. This document defines a **history table** that captures point-in-time snapshots for dashboard visualization.

## Design Principle: CQRS Read Model

The history table is a **read-optimized projection**, not a source of truth. The pipeline (write side) continues to use `asset-state` for real-time risk computation. The history table (read side) is append-only, eventually consistent, and expendable — it can be rebuilt by replaying Kinesis streams.

## Infrastructure Implementation

### DynamoDB Table: `streaming-agents-asset-history`

**Terraform:** Uses the reusable `infra/modules/dynamodb` module.
**Environment Config:** `infra/envs/dev/history-projector.tf`

### Lambda Function: `history-projector`

**Purpose:** Fan-out processor that consumes `RiskEvent` from `r17-risk-events` stream and projects into `asset-history` table.

**Trigger:** Kinesis Event Source Mapping
**Batch size:** 100 events
**Batching window:** 5 seconds
**Parallelization:** 10 concurrent batches per shard
**Retry:** 3 attempts, bisect on error
**DLQ:** `r17-risk-events-dlq`

**Environment Variables:**
- `KINESIS_INPUT_STREAM`: `streaming-agents-r17-risk-events`
- `DYNAMODB_HISTORY_TABLE`: `streaming-agents-asset-history`
- `TTL_HOURS`: `24` (demo), `168` (7 days extended)
- `BATCH_SIZE`: `25` (DynamoDB batch write limit)

## Table: `streaming-agents-asset-history`

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` (PK) | `S` | Asset identifier (e.g., `R-17`) |
| `timestamp` (SK) | `S` | ISO 8601 timestamp of the reading |
| `composite_risk` | `N` | Risk score at this point in time (0.0–1.0) |
| `risk_state` | `S` | `nominal` / `elevated` / `critical` |
| `z_scores` | `M` | `{ position_error_z, accel_z, gyro_z, temperature_z }` |
| `last_values` | `M` | `{ board_temperature_c, accel_magnitude_ms2, gyro_magnitude_rads, joint_position_error_deg, control_loop_freq_hz }` |
| `threshold_breach` | `N` | 0.0, 0.5, or 1.0 |
| `contributing_signals` | `L` | Signal names with \|z\| > 2.0 |
| `expires_at` | `N` | TTL epoch seconds for automatic cleanup |

### Key Design

```
PK: asset_id    (String)
SK: timestamp   (String, ISO 8601)
```

This supports:
- **Asset detail time series**: Query `PK = "R-17"` with `SK BETWEEN "2026-03-10T14:00:00Z" AND "2026-03-10T14:10:00Z"`
- **Fleet snapshot**: BatchGetItem on known asset IDs with `ScanIndexForward = false, Limit = 1` to get latest row per asset
- **Recent history**: Query `PK = "R-17"` with `ScanIndexForward = false, Limit = 60` for last 30 seconds at 2 Hz

### Retention Strategy

| Strategy | TTL Value | Use Case |
|----------|-----------|----------|
| Demo (default) | 24 hours | Keep costs near-zero; sufficient for live demo |
| Extended | 7 days | Post-demo analysis |

Set `expires_at = Math.floor(Date.now() / 1000) + 86400` (24h) on every row. DynamoDB TTL handles cleanup automatically with no Lambda cost.

### Write Volume Estimate

At 2 Hz per asset × 6 assets = 12 writes/s = 43,200 rows/hour. With 24h TTL, steady-state is ~1M rows. At ~200 bytes/row, that's ~200 MB — well within DynamoDB free tier on-demand billing.

**Cost:** ~$1.50/day for demo (~$45/month)

## Data Flow

### Write Path

```
Signal Agent
  ↓ (computes risk)
asset-state table (latest snapshot)
  ↓ (emits RiskEvent)
r17-risk-events stream
  ↓ (Kinesis ESM trigger)
History Projector Lambda
  ↓ (transforms + batch write)
asset-history table (time series)
  ↓ (TTL cleanup after 24h)
Expired rows deleted
```

**Latency:** < 1 second end-to-end

### Read Path

```
Dashboard API
  ↓ (Query with SK range)
asset-history table
  ↓ (returns time series)
HistoryPoint[]
  ↓ (renders chart)
Dashboard UI
```

**Query latency:** < 100ms

## What Does NOT Go in History

- Raw telemetry payloads (too large, already in Kinesis with 24h retention)
- Bedrock prompts/responses (in CloudWatch logs)
- Incident lifecycle changes (already in `incidents` table with timestamps)
- Baseline EMA values (internal to Signal Agent, not needed for display)

## Relationship to Other Tables

```
asset-state (current snapshot)     ←── Signal Agent writes
asset-history (time series)        ←── History Projector writes
incidents (lifecycle + detail)     ←── Actions Agent writes
```

The dashboard reads from all three tables but only `asset-history` is new infrastructure.

## Operational Characteristics

### Monitoring
- **CloudWatch Metrics**: Lambda invocations, errors, duration, DynamoDB throttles
- **X-Ray Traces**: End-to-end latency from Kinesis to DynamoDB
- **Prometheus Metrics**: Custom metrics (rows_written, batch_size)
- **DLQ Depth**: Alert if > 0 (indicates processing failures)

### Disaster Recovery
- **Rebuild from Kinesis**: Replay `r17-risk-events` stream (24h retention)
- **Backup**: DynamoDB point-in-time recovery (disabled for demo, enable for production)
- **Data loss**: Acceptable for demo (history is expendable)

## Testing Strategy

### Unit Tests
- Transform `RiskEvent` → `HistoryRow`
- Calculate `expires_at` correctly
- Batch DynamoDB writes (25 items per batch)

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

## References

- Architecture: `docs/ai/architecture/dashboard-read-model.md`
- Dashboard API: `docs/03-apis/dashboard-api.md`
- Lambda source: `apps/lambdas/history-projector/`
- Terraform: `infra/envs/dev/history-projector.tf`
