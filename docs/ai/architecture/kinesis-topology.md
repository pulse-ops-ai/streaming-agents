# Architecture: Kinesis Topology

## Streams

| Stream Name | Shards | Partition Key | Producers | Consumers |
|-------------|--------|---------------|-----------|-----------|
| `r17-telemetry` | 2 | `asset_id` | Edge Exporter, Simulator Worker | Ingestion Service |
| `r17-ingested` | 2 | `asset_id` | Ingestion Service | Signal Agent |
| `r17-risk-events` | 1 | `asset_id` | Signal Agent | Diagnosis Agent |
| `r17-diagnosis` | 1 | `asset_id` | Diagnosis Agent | Actions Agent |
| `r17-actions` | 1 | `asset_id` | Actions Agent | Conversation Agent (Phase 4) |

## SQS Queues

| Queue Name | Purpose | Producer | Consumer |
|-----------|---------|----------|----------|
| `r17-telemetry-dlq` | Failed ingestion records | Ingestion Service | Manual / alerting |
| `r17-ingested-dlq` | Failed signal agent records | Signal Agent | Manual / alerting |
| `r17-diagnosis-dlq` | Failed diagnosis records (malformed LLM responses) | Diagnosis Agent | Manual / alerting |

## DynamoDB Tables

| Table Name | Hash Key | Range Key | GSI | Purpose |
|-----------|----------|-----------|-----|---------|
| `streaming-agents-asset-state` | `asset_id` | — | — | Per-asset baselines, risk state, last values |
| `streaming-agents-incidents` | `incident_id` | — | `asset_id` + `status` | Incident lifecycle (opened/escalated/resolved) |

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
      ┌──────┴───────────┐
      │ Diagnosis Agent  │
      │ (Lambda, ESM)    │
      └──┬──────────┬────┘
         │          │
  ┌──────┴───┐  ┌───┴──────────┐
  │r17-      │  │r17-diagnosis │
  │diagnosis │  │-dlq (SQS)   │
  │(Kinesis) │  └──────────────┘
  └──────┬───┘
         │       Bedrock
         │       (Claude Sonnet)
  ┌──────┴───────────┐
  │ Actions Agent    │
  │ (Lambda, ESM)    │
  └──┬───────────┬───┘
     │           │
  ┌──┴───────┐  ┌┴──────────────┐
  │r17-      │  │ DynamoDB:     │
  │actions   │  │ incidents     │
  │(Kinesis) │  └───────────────┘
  └──────┬───┘
         │
         ▼
  Phase 4: Conversation Agent (future)
```

## Shard Capacity Planning

Each Kinesis shard supports:
- 1 MB/s or 1,000 records/s write
- 2 MB/s or 5 reads/s (per consumer)

**Peak load estimate:**
- 50 robots × 2 Hz = 100 events/s
- Event size: ~500 bytes → 50 KB/s
- 2 shards provides 100% headroom

**Downstream streams (r17-risk-events, r17-diagnosis, r17-actions):**
- 1 shard each is sufficient — volume is same or lower than upstream
- Diagnosis stream has lower volume due to nominal skip + debounce (30s per asset)

**LocalStack note:** LocalStack Kinesis may not enforce shard limits.
Test with real AWS before scaling assumptions.

## Terraform Resources

```hcl
# ── Phase 2 Kinesis Streams ─────────────────────────────

resource "aws_kinesis_stream" "r17_telemetry" {
  name             = "streaming-agents-r17-telemetry"
  shard_count      = 2
  retention_period = 24  # hours

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }
}

resource "aws_kinesis_stream" "r17_ingested" {
  name             = "streaming-agents-r17-ingested"
  shard_count      = 2
  retention_period = 24
  stream_mode_details { stream_mode = "PROVISIONED" }
}

resource "aws_kinesis_stream" "r17_risk_events" {
  name             = "streaming-agents-r17-risk-events"
  shard_count      = 1
  retention_period = 24
  stream_mode_details { stream_mode = "PROVISIONED" }
}

# ── Phase 3 Kinesis Streams ─────────────────────────────

resource "aws_kinesis_stream" "r17_diagnosis" {
  name             = "streaming-agents-r17-diagnosis"
  shard_count      = 1
  retention_period = 24
  stream_mode_details { stream_mode = "PROVISIONED" }
}

resource "aws_kinesis_stream" "r17_actions" {
  name             = "streaming-agents-r17-actions"
  shard_count      = 1
  retention_period = 24
  stream_mode_details { stream_mode = "PROVISIONED" }
}

# ── SQS DLQs ────────────────────────────────────────────

resource "aws_sqs_queue" "r17_telemetry_dlq" {
  name                       = "streaming-agents-r17-telemetry-dlq"
  message_retention_seconds  = 1209600  # 14 days
  visibility_timeout_seconds = 300
}

resource "aws_sqs_queue" "r17_ingested_dlq" {
  name                       = "streaming-agents-r17-ingested-dlq"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 300
}

resource "aws_sqs_queue" "r17_diagnosis_dlq" {
  name                       = "streaming-agents-r17-diagnosis-dlq"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 300
}

# ── EventBridge Rule (simulator cron) ────────────────────

resource "aws_cloudwatch_event_rule" "simulator_cron" {
  name                = "streaming-agents-simulator-cron"
  schedule_expression = "rate(1 minute)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "simulator_controller" {
  rule = aws_cloudwatch_event_rule.simulator_cron.name
  arn  = aws_lambda_function.simulator_controller.arn
}

# ── DynamoDB ─────────────────────────────────────────────

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

resource "aws_dynamodb_table" "incidents" {
  name         = "streaming-agents-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incident_id"

  attribute {
    name = "incident_id"
    type = "S"
  }

  attribute {
    name = "asset_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "asset_id-status-index"
    hash_key        = "asset_id"
    range_key       = "status"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

# ── Kinesis Event Source Mappings ─────────────────────────

# Ingestion ← r17-telemetry
resource "aws_lambda_event_source_mapping" "ingestion_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_telemetry.arn
  function_name                      = aws_lambda_function.ingestion_service.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true
}

# Signal Agent ← r17-ingested
resource "aws_lambda_event_source_mapping" "signal_agent_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_ingested.arn
  function_name                      = aws_lambda_function.signal_agent.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true
}

# Diagnosis Agent ← r17-risk-events
resource "aws_lambda_event_source_mapping" "diagnosis_agent_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_risk_events.arn
  function_name                      = aws_lambda_function.diagnosis_agent.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.r17_diagnosis_dlq.arn
    }
  }
}

# Actions Agent ← r17-diagnosis
resource "aws_lambda_event_source_mapping" "actions_agent_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_diagnosis.arn
  function_name                      = aws_lambda_function.actions_agent.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true
}

# ── IAM (Phase 3 additions) ──────────────────────────────

# Diagnosis Agent: read risk-events, write diagnosis, read/write asset-state, invoke Bedrock
resource "aws_iam_role_policy" "diagnosis_agent" {
  name = "streaming-agents-diagnosis-agent-policy"
  role = aws_iam_role.diagnosis_agent.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:GetRecords", "kinesis:GetShardIterator", "kinesis:DescribeStream"]
        Resource = aws_kinesis_stream.r17_risk_events.arn
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords"]
        Resource = aws_kinesis_stream.r17_diagnosis.arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.asset_state.arn
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:*::foundation-model/anthropic.*"
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.r17_diagnosis_dlq.arn
      }
    ]
  })
}

# Actions Agent: read diagnosis, write actions, read/write incidents
resource "aws_iam_role_policy" "actions_agent" {
  name = "streaming-agents-actions-agent-policy"
  role = aws_iam_role.actions_agent.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:GetRecords", "kinesis:GetShardIterator", "kinesis:DescribeStream"]
        Resource = aws_kinesis_stream.r17_diagnosis.arn
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords"]
        Resource = aws_kinesis_stream.r17_actions.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.incidents.arn,
          "${aws_dynamodb_table.incidents.arn}/index/*"
        ]
      }
    ]
  })
}
```

## Naming Convention

All AWS resources use the prefix `streaming-agents-` for easy identification
and cleanup. Terraform state separates localstack and aws-sandbox workspaces.
