# Architecture: Kinesis Topology

## Streams

| Stream Name | Shards | Partition Key | Producers | Consumers |
|-------------|--------|---------------|-----------|-----------|
| `r17-telemetry` | 2 | `asset_id` | Edge Exporter, Simulator Worker | Ingestion Service |
| `r17-ingested` | 2 | `asset_id` | Ingestion Service | Signal Agent |
| `r17-risk-events` | 1 | `asset_id` | Signal Agent | Diagnosis Agent (Phase 3) |

## SQS Queues

| Queue Name | Purpose | Producer | Consumer |
|-----------|---------|----------|----------|
| `r17-telemetry-dlq` | Failed ingestion records | Ingestion Service | Manual / alerting |
| `r17-ingested-dlq` | Failed signal agent records | Signal Agent | Manual / alerting |

## Data Flow

```
                    ┌──────────────────┐
                    │  Edge Exporter   │ (Python, RPi)
                    │  source: edge    │
                    └────────┬─────────┘
                             │
                             ▼
┌──────────────────┐   ┌─────────────────┐
│ Sim Controller   │──▶│ Sim Workers (N) │
│ (EventBridge)    │   │ source: sim     │
└──────────────────┘   └────────┬────────┘
                                │
                    ┌───────────┴───────────┐
                    │ Kinesis: r17-telemetry │
                    │ (2 shards)             │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │  Ingestion Service    │
                    │  (Lambda, Kinesis ESM)│
                    └──┬────────────────┬───┘
                       │                │
              ┌────────┴───┐    ┌───────┴──────┐
              │ r17-ingested│    │ r17-telemetry│
              │ (Kinesis)   │    │ -dlq (SQS)  │
              └──────┬──────┘    └──────────────┘
                     │
              ┌──────┴──────┐
              │ Signal Agent │
              │ (Lambda, ESM)│
              └──┬───────┬──┘
                 │       │
      ┌──────────┴──┐  ┌┴──────────────┐
      │r17-risk-    │  │ DynamoDB:     │
      │events       │  │ asset-state   │
      │(Kinesis)    │  └───────────────┘
      └──────┬──────┘
             │
             ▼
      Phase 3: Diagnosis Agent (future)
```

## Shard Capacity Planning

Each Kinesis shard supports:
- 1 MB/s or 1,000 records/s write
- 2 MB/s or 5 reads/s (per consumer)

**Peak load estimate:**
- 50 robots × 2 Hz = 100 events/s
- Event size: ~500 bytes → 50 KB/s
- 2 shards provides 100% headroom

**LocalStack note:** LocalStack Kinesis may not enforce shard limits.
Test with real AWS before scaling assumptions.

## Terraform Resources

```hcl
# Kinesis Streams
resource "aws_kinesis_stream" "r17_telemetry" {
  name             = "r17-telemetry"
  shard_count      = 2
  retention_period = 24  # hours

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }
}

resource "aws_kinesis_stream" "r17_ingested" {
  name             = "r17-ingested"
  shard_count      = 2
  retention_period = 24
  stream_mode_details { stream_mode = "PROVISIONED" }
}

resource "aws_kinesis_stream" "r17_risk_events" {
  name             = "r17-risk-events"
  shard_count      = 1
  retention_period = 24
  stream_mode_details { stream_mode = "PROVISIONED" }
}

# SQS DLQs
resource "aws_sqs_queue" "r17_telemetry_dlq" {
  name                       = "r17-telemetry-dlq"
  message_retention_seconds  = 1209600  # 14 days
  visibility_timeout_seconds = 300
}

resource "aws_sqs_queue" "r17_ingested_dlq" {
  name                       = "r17-ingested-dlq"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 300
}

# EventBridge Rule (simulator cron)
resource "aws_cloudwatch_event_rule" "simulator_cron" {
  name                = "simulator-cron"
  schedule_expression = "rate(1 minute)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "simulator_controller" {
  rule = aws_cloudwatch_event_rule.simulator_cron.name
  arn  = aws_lambda_function.simulator_controller.arn
}

# DynamoDB
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

## Naming Convention

All AWS resources use the prefix `streaming-agents-` for easy identification
and cleanup. Terraform state separates localstack and aws-sandbox workspaces.
