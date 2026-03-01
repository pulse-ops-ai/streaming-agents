environment = "dev"
aws_region  = "us-east-1"
aws_profile = "streaming-agents-sandbox-kong"

# Kinesis Configuration
kinesis_shard_count      = 2
kinesis_retention_period = 24

# Lambda Configuration
lambda_memory_mb   = 512
lambda_timeout_sec = 30

# Observability
enable_xray = true
log_level   = "DEBUG"

# Cost Optimization
auto_shutdown_enabled = true
