variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile"
  type        = string
  default     = "streaming-agents-sandbox-kong"
}

variable "kinesis_shard_count" {
  description = "Number of shards for Kinesis streams"
  type        = number
  default     = 2
}

variable "kinesis_retention_period" {
  description = "Kinesis data retention period in hours"
  type        = number
  default     = 24
}

variable "lambda_memory_mb" {
  description = "Default Lambda memory in MB"
  type        = number
  default     = 512
}

variable "lambda_timeout_sec" {
  description = "Default Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

variable "log_level" {
  description = "Log level for Lambda functions"
  type        = string
  default     = "DEBUG"
}

variable "auto_shutdown_enabled" {
  description = "Enable automatic shutdown during off-hours"
  type        = bool
  default     = true
}
