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
