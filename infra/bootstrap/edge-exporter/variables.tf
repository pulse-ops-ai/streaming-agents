variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "streaming-agents-sandbox-kong"
}

variable "stream_name" {
  description = "Kinesis stream name for telemetry data"
  type        = string
  default     = "streaming-agents-r17-telemetry"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}
