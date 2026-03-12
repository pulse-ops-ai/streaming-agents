variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "staging"
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
  default     = 4
}

variable "kinesis_retention_period" {
  description = "Kinesis data retention period in hours"
  type        = number
  default     = 48
}

variable "lambda_memory_mb" {
  description = "Default Lambda memory in MB"
  type        = number
  default     = 1024
}

variable "lambda_timeout_sec" {
  description = "Default Lambda timeout in seconds"
  type        = number
  default     = 60
}

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

variable "log_level" {
  description = "Log level for Lambda functions"
  type        = string
  default     = "INFO"
}

variable "auto_shutdown_enabled" {
  description = "Enable automatic shutdown during off-hours"
  type        = bool
  default     = true
}
