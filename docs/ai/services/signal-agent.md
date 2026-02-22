# Service Contract: Signal Agent

## Identity
- **Service:** `signal-agent`
- **Location:** `apps/lambdas/signal-agent/`
- **Runtime:** NestJS on AWS Lambda
- **Trigger:** Kinesis stream `r17-ingested` (event source mapping)
- **Phase:** 2.7

## Purpose

The Signal Agent is the first analytical stage in the pipeline. It maintains
rolling baselines per asset, computes z-scores for anomaly detection, and
calculates the composite risk score using the LOCKED deterministic formula.
It writes updated asset state to DynamoDB and emits risk events for downstream
agents (Phase 3).

## What It Receives

`IngestedEvent` from Kinesis stream `r17-ingested` (enriched by ingestion service).

## What It Does

For each `IngestedEvent`:

1. **Extract telemetry** from `event.payload`
2. **Load asset state** from DynamoDB (key: `asset_id`)
   - If no state exists, initialize with first reading as baseline
3. **Update rolling baselines** (exponential moving average):
   ```typescript
   // Window: last 60 readings (30 seconds at 2 Hz)
   // EMA alpha = 2 / (window + 1)
   const WINDOW = 60;
   const ALPHA = 2 / (WINDOW + 1);

   newMean = ALPHA * currentValue + (1 - ALPHA) * previousMean;
   newVariance = ALPHA * (currentValue - newMean) ** 2 + (1 - ALPHA) * previousVariance;
   newStdDev = Math.sqrt(newVariance);
   ```
4. **Compute z-scores** for each signal:
   ```typescript
   z_score = (currentValue - rollingMean) / Math.max(rollingStdDev, MIN_STDDEV);
   // MIN_STDDEV = 0.001 (prevents division by zero)
   ```
5. **Compute threshold breach** score:
   ```typescript
   const THRESHOLDS = {
     board_temperature_c: { warn: 50, critical: 60 },
     accel_magnitude_ms2: { warn: 12, critical: 15 },
     gyro_magnitude_rads: { warn: 0.1, critical: 0.2 },
     joint_position_error_deg: { warn: 1.0, critical: 2.5 },
   };
   // threshold_breach = 0.0 (none), 0.5 (warn), 1.0 (critical)
   // Take max across all signals
   ```
6. **Compute composite risk** (LOCKED FORMULA):
   ```
   composite_risk =
     0.35 × abs(position_error_z) +
     0.25 × abs(accel_z) +
     0.15 × abs(gyro_z) +
     0.15 × abs(temperature_z) +
     0.10 × threshold_breach
   ```
   Normalize to [0, 1] range: `Math.min(composite_risk / 3.0, 1.0)`

7. **Determine risk state**:
   - `nominal`: composite_risk < 0.50
   - `elevated`: 0.50 ≤ composite_risk < 0.75
   - `critical`: composite_risk ≥ 0.75

8. **Write updated state to DynamoDB**:
   ```typescript
   interface AssetState {
     asset_id: string;               // PK
     updated_at: string;             // ISO 8601
     reading_count: number;          // total readings processed
     // Rolling baselines per signal
     baselines: {
       [signal: string]: {
         mean: number;
         variance: number;
         std_dev: number;
       };
     };
     // Current z-scores
     z_scores: {
       position_error_z: number;
       accel_z: number;
       gyro_z: number;
       temperature_z: number;
     };
     // Risk assessment
     composite_risk: number;
     risk_state: 'nominal' | 'elevated' | 'critical';
     threshold_breach: number;
     // Last raw values (for diagnosis agent)
     last_values: {
       board_temperature_c: number;
       accel_magnitude_ms2: number;
       gyro_magnitude_rads: number;
       joint_position_error_deg: number;
       control_loop_freq_hz: number;
     };
     // Trace correlation
     last_trace_id: string;
     last_event_id: string;
   }
   ```

9. **Emit risk event** to Kinesis stream `r17-risk-events` (partition key: `asset_id`):
   ```typescript
   interface RiskEvent {
     event_id: string;
     trace_id: string;         // propagated from ingestion
     asset_id: string;
     timestamp: string;
     composite_risk: number;
     risk_state: 'nominal' | 'elevated' | 'critical';
     z_scores: Record<string, number>;
     threshold_breach: number;
     contributing_signals: string[];  // signals with |z| > 2.0
     last_values: Record<string, number>;
   }
   ```

## What It Emits

`RiskEvent` to Kinesis stream `r17-risk-events`.

## What It Must NOT Do

- Must NOT modify the risk formula weights
- Must NOT use LLM/ML for risk scoring — purely deterministic math
- Must NOT create incidents (that's the Actions Agent in Phase 3)
- Must NOT call Bedrock or any AI service
- Must NOT skip DynamoDB writes — every reading updates state

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KINESIS_INPUT_STREAM` | yes | — | Source stream (r17-ingested) |
| `KINESIS_OUTPUT_STREAM` | yes | — | Risk events stream (r17-risk-events) |
| `DYNAMODB_TABLE` | yes | — | Asset state table name |
| `AWS_REGION` | yes | — | AWS region |
| `OTEL_SERVICE_NAME` | no | `signal-agent` | OTel service name |
| `EMA_WINDOW` | no | `60` | Rolling baseline window size |
| `MIN_STDDEV` | no | `0.001` | Minimum std dev (prevent div/0) |
| `RISK_NORMALIZE_DIVISOR` | no | `3.0` | Normalization divisor for risk score |

## Dependencies

- `@streaming-agents/core-contracts` — IngestedEvent, RiskEvent types
- `@streaming-agents/core-config` — validated env config
- `@streaming-agents/core-telemetry` — OTel span continuation
- `@streaming-agents/core-kinesis` — Kinesis consumer/producer
- `@streaming-agents/lambda-base` — BaseLambdaHandler
- `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` — DynamoDB access

## OTel Instrumentation

- Span: `signal-agent.process` (continues trace from ingestion)
  - `telemetry.asset_id`
  - `signal.composite_risk`
  - `signal.risk_state`
  - `signal.reading_count`
- Span: `signal-agent.dynamodb.read` (child)
- Span: `signal-agent.compute` (child)
- Span: `signal-agent.dynamodb.write` (child)
- Span: `signal-agent.emit` (child)
- Metric: `signal_agent.risk_score` (gauge, tags: asset_id, risk_state)
- Metric: `signal_agent.events_processed` (counter, tags: risk_state)
- Metric: `signal_agent.dynamodb_latency_ms` (histogram, tags: operation)
- Metric: `signal_agent.z_scores` (gauge, tags: asset_id, signal_name)

## DynamoDB Table Schema

```hcl
resource "aws_dynamodb_table" "asset_state" {
  name         = "streaming-agents-asset-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "asset_id"

  attribute {
    name = "asset_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}
```
