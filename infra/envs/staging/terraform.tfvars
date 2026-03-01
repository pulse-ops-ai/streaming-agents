environment = "staging"
aws_region  = "us-east-1"
aws_profile = "streaming-agents-sandbox-kong"

# Kinesis Configuration (more capacity than dev)
kinesis_shard_count      = 4
kinesis_retention_period = 48

# Lambda Configuration (more resources than dev)
lambda_memory_mb   = 1024
lambda_timeout_sec = 60

# Observability
enable_xray = true
log_level   = "INFO"

# Cost Optimization
auto_shutdown_enabled = true
