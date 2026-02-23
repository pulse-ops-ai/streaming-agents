# DynamoDB Tables for Streaming Agents
# See: docs/ai/architecture/kinesis-topology.md

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

  tags = {
    Name        = "streaming-agents-asset-state"
    Environment = "localstack"
    Purpose     = "Asset state and rolling baselines"
    Project     = "streaming-agents"
  }
}

# ── Phase 3 DynamoDB Tables ──────────────────────────────────────

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

  tags = {
    Name        = "streaming-agents-incidents"
    Environment = "localstack"
    Purpose     = "Incident lifecycle tracking"
    Project     = "streaming-agents"
  }
}
