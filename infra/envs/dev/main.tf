# Dev Environment Infrastructure
# This configuration deploys the streaming-agents infrastructure to the dev environment

locals {
  common_tags = {
    Environment  = var.environment
    Project      = "streaming-agents"
    ManagedBy    = "terraform"
    Repository   = "pulse-ops-ai/streaming-agents"
    AutoShutdown = var.auto_shutdown_enabled ? "true" : "false"
  }
}

# ── DynamoDB Tables ───────────────────────────────────────────────

module "asset_state_table" {
  source = "../../modules/dynamodb"

  table_name   = "streaming-agents-asset-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "assetId"

  attributes = [
    {
      name = "assetId"
      type = "S"
    }
  ]

  tags = local.common_tags
}

module "incidents_table" {
  source = "../../modules/dynamodb"

  table_name   = "streaming-agents-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incidentId"
  range_key    = "timestamp"

  attributes = [
    {
      name = "incidentId"
      type = "S"
    },
    {
      name = "timestamp"
      type = "N"
    }
  ]

  tags = local.common_tags
}

# ── Kinesis Streams ───────────────────────────────────────────────

module "r17_telemetry_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-telemetry"
  shard_count      = var.kinesis_shard_count
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_ingested_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-ingested"
  shard_count      = var.kinesis_shard_count
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_risk_events_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-risk-events"
  shard_count      = 1
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_diagnosis_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-diagnosis"
  shard_count      = 1
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_actions_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-actions"
  shard_count      = 1
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}
