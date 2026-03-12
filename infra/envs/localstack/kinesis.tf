# Kinesis Data Streams for Streaming Agents
# See: docs/ai/architecture/kinesis-topology.md

resource "aws_kinesis_stream" "r17_telemetry" {
  name             = "streaming-agents-r17-telemetry"
  shard_count      = 2
  retention_period = 24 # hours

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }

  tags = {
    Name        = "streaming-agents-r17-telemetry"
    Environment = "localstack"
    Stream      = "telemetry"
    Project     = "streaming-agents"
  }
}

resource "aws_kinesis_stream" "r17_ingested" {
  name             = "streaming-agents-r17-ingested"
  shard_count      = 2
  retention_period = 24

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }

  tags = {
    Name        = "streaming-agents-r17-ingested"
    Environment = "localstack"
    Stream      = "ingested"
    Project     = "streaming-agents"
  }
}

resource "aws_kinesis_stream" "r17_risk_events" {
  name             = "streaming-agents-r17-risk-events"
  shard_count      = 1
  retention_period = 24

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }

  tags = {
    Name        = "streaming-agents-r17-risk-events"
    Environment = "localstack"
    Stream      = "risk-events"
    Project     = "streaming-agents"
  }
}

# ── Phase 3 Kinesis Streams ──────────────────────────────────────

resource "aws_kinesis_stream" "r17_diagnosis" {
  name             = "streaming-agents-r17-diagnosis"
  shard_count      = 1
  retention_period = 24

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }

  tags = {
    Name        = "streaming-agents-r17-diagnosis"
    Environment = "localstack"
    Stream      = "diagnosis"
    Project     = "streaming-agents"
  }
}

resource "aws_kinesis_stream" "r17_actions" {
  name             = "streaming-agents-r17-actions"
  shard_count      = 1
  retention_period = 24

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }

  tags = {
    Name        = "streaming-agents-r17-actions"
    Environment = "localstack"
    Stream      = "actions"
    Project     = "streaming-agents"
  }
}
