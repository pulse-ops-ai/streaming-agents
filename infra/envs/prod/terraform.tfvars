environment = "prod"
aws_region  = "us-east-1"
aws_profile = "streaming-agents-sandbox-kong"

# Kinesis Configuration (production capacity)
kinesis_shard_count      = 8
kinesis_retention_period = 168  # 7 days

# Lambda Configuration (production resources)
lambda_memory_mb   = 2048
lambda_timeout_sec = 120

# Observability
enable_xray = true
log_level   = "WARN"

# Cost Optimization (NEVER auto-shutdown in prod)
auto_shutdown_enabled = false
