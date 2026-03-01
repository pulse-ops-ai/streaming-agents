# Reusable Kinesis Stream Module

variable "stream_name" {
  description = "Name of the Kinesis stream"
  type        = string
}

variable "shard_count" {
  description = "Number of shards for the stream"
  type        = number
  default     = 1
}

variable "retention_period" {
  description = "Data retention period in hours (24-8760)"
  type        = number
  default     = 24
}

variable "encryption_type" {
  description = "Encryption type (NONE or KMS)"
  type        = string
  default     = "NONE"
}

variable "kms_key_id" {
  description = "KMS key ID for encryption (required if encryption_type is KMS)"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to the Kinesis stream"
  type        = map(string)
  default     = {}
}

resource "aws_kinesis_stream" "this" {
  name             = var.stream_name
  shard_count      = var.shard_count
  retention_period = var.retention_period
  encryption_type  = var.encryption_type
  kms_key_id       = var.kms_key_id

  tags = var.tags
}

output "stream_name" {
  description = "Name of the Kinesis stream"
  value       = aws_kinesis_stream.this.name
}

output "stream_arn" {
  description = "ARN of the Kinesis stream"
  value       = aws_kinesis_stream.this.arn
}

output "shard_count" {
  description = "Number of shards in the stream"
  value       = aws_kinesis_stream.this.shard_count
}
