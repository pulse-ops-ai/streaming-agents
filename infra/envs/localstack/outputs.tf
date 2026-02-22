# LocalStack environment outputs

# ── Kinesis Streams ───────────────────────────────────────────────

output "kinesis_r17_telemetry_arn" {
  description = "ARN of the r17-telemetry Kinesis stream"
  value       = aws_kinesis_stream.r17_telemetry.arn
}

output "kinesis_r17_telemetry_name" {
  description = "Name of the r17-telemetry Kinesis stream"
  value       = aws_kinesis_stream.r17_telemetry.name
}

output "kinesis_r17_ingested_arn" {
  description = "ARN of the r17-ingested Kinesis stream"
  value       = aws_kinesis_stream.r17_ingested.arn
}

output "kinesis_r17_ingested_name" {
  description = "Name of the r17-ingested Kinesis stream"
  value       = aws_kinesis_stream.r17_ingested.name
}

output "kinesis_r17_risk_events_arn" {
  description = "ARN of the r17-risk-events Kinesis stream"
  value       = aws_kinesis_stream.r17_risk_events.arn
}

output "kinesis_r17_risk_events_name" {
  description = "Name of the r17-risk-events Kinesis stream"
  value       = aws_kinesis_stream.r17_risk_events.name
}

# ── SQS Queues ────────────────────────────────────────────────────

output "sqs_r17_telemetry_dlq_url" {
  description = "URL of the r17-telemetry DLQ"
  value       = aws_sqs_queue.r17_telemetry_dlq.url
}

output "sqs_r17_telemetry_dlq_arn" {
  description = "ARN of the r17-telemetry DLQ"
  value       = aws_sqs_queue.r17_telemetry_dlq.arn
}

output "sqs_r17_ingested_dlq_url" {
  description = "URL of the r17-ingested DLQ"
  value       = aws_sqs_queue.r17_ingested_dlq.url
}

output "sqs_r17_ingested_dlq_arn" {
  description = "ARN of the r17-ingested DLQ"
  value       = aws_sqs_queue.r17_ingested_dlq.arn
}

# ── DynamoDB Tables ───────────────────────────────────────────────

output "dynamodb_asset_state_name" {
  description = "Name of the asset-state DynamoDB table"
  value       = aws_dynamodb_table.asset_state.name
}

output "dynamodb_asset_state_arn" {
  description = "ARN of the asset-state DynamoDB table"
  value       = aws_dynamodb_table.asset_state.arn
}

# ── EventBridge Rules ─────────────────────────────────────────────

output "eventbridge_simulator_cron_arn" {
  description = "ARN of the simulator cron EventBridge rule"
  value       = aws_cloudwatch_event_rule.simulator_cron.arn
}

output "eventbridge_simulator_cron_name" {
  description = "Name of the simulator cron EventBridge rule"
  value       = aws_cloudwatch_event_rule.simulator_cron.name
}

# ── Lambda Functions ──────────────────────────────────────────────

output "lambda_simulator_controller_arn" {
  description = "ARN of the simulator-controller Lambda function"
  value       = aws_lambda_function.simulator_controller.arn
}

output "lambda_simulator_controller_name" {
  description = "Name of the simulator-controller Lambda function"
  value       = aws_lambda_function.simulator_controller.function_name
}

output "lambda_simulator_worker_arn" {
  description = "ARN of the simulator-worker Lambda function"
  value       = aws_lambda_function.simulator_worker.arn
}

output "lambda_simulator_worker_name" {
  description = "Name of the simulator-worker Lambda function"
  value       = aws_lambda_function.simulator_worker.function_name
}

output "lambda_ingestion_arn" {
  description = "ARN of the ingestion Lambda function"
  value       = aws_lambda_function.ingestion_service.arn
}

output "lambda_ingestion_name" {
  description = "Name of the ingestion Lambda function"
  value       = aws_lambda_function.ingestion_service.function_name
}

output "lambda_signal_agent_arn" {
  description = "ARN of the signal-agent Lambda function"
  value       = aws_lambda_function.signal_agent.arn
}

output "lambda_signal_agent_name" {
  description = "Name of the signal-agent Lambda function"
  value       = aws_lambda_function.signal_agent.function_name
}

# ── IAM Roles ─────────────────────────────────────────────────────

output "iam_simulator_controller_role_arn" {
  description = "ARN of the simulator-controller Lambda execution role"
  value       = aws_iam_role.simulator_controller.arn
}

output "iam_simulator_worker_role_arn" {
  description = "ARN of the simulator-worker Lambda execution role"
  value       = aws_iam_role.simulator_worker.arn
}

output "iam_ingestion_service_role_arn" {
  description = "ARN of the ingestion-service Lambda execution role"
  value       = aws_iam_role.ingestion_service.arn
}

output "iam_signal_agent_role_arn" {
  description = "ARN of the signal-agent Lambda execution role"
  value       = aws_iam_role.signal_agent.arn
}

# ── Event Source Mappings ─────────────────────────────────────────

output "esm_ingestion_uuid" {
  description = "UUID of the ingestion Kinesis event source mapping"
  value       = aws_lambda_event_source_mapping.ingestion_kinesis.uuid
}

output "esm_signal_agent_uuid" {
  description = "UUID of the signal-agent Kinesis event source mapping"
  value       = aws_lambda_event_source_mapping.signal_agent_kinesis.uuid
}
