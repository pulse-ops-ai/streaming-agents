# SQS Dead Letter Queues for Streaming Agents
# See: docs/ai/architecture/kinesis-topology.md

resource "aws_sqs_queue" "r17_telemetry_dlq" {
  name                       = "streaming-agents-r17-telemetry-dlq"
  message_retention_seconds  = 1209600 # 14 days
  visibility_timeout_seconds = 300     # 5 minutes

  tags = {
    Name        = "streaming-agents-r17-telemetry-dlq"
    Environment = "localstack"
    Purpose     = "DLQ for failed ingestion records"
    Project     = "streaming-agents"
  }
}

resource "aws_sqs_queue" "r17_ingested_dlq" {
  name                       = "streaming-agents-r17-ingested-dlq"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 300

  tags = {
    Name        = "streaming-agents-r17-ingested-dlq"
    Environment = "localstack"
    Purpose     = "DLQ for failed signal agent records"
    Project     = "streaming-agents"
  }
}
