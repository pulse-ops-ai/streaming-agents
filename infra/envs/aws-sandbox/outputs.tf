# AWS Sandbox environment outputs

# ── Observability Outputs ─────────────────────────────────────────

output "prometheus_endpoint" {
  description = "Amazon Managed Prometheus remote write endpoint"
  value       = aws_prometheus_workspace.metrics.prometheus_endpoint
}

output "prometheus_query_endpoint" {
  description = "Amazon Managed Prometheus query endpoint"
  value       = "${aws_prometheus_workspace.metrics.prometheus_endpoint}api/v1/query"
}

output "prometheus_workspace_id" {
  description = "Amazon Managed Prometheus workspace ID"
  value       = aws_prometheus_workspace.metrics.id
}

output "grafana_endpoint" {
  description = "Amazon Managed Grafana workspace URL"
  value       = aws_grafana_workspace.dashboard.endpoint
}

output "grafana_workspace_id" {
  description = "Amazon Managed Grafana workspace ID for API access"
  value       = aws_grafana_workspace.dashboard.id
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = aws_cloudwatch_dashboard.fleet_overview.dashboard_name
}

# ── Lambda Outputs ────────────────────────────────────────────────

output "conversation_agent_function_name" {
  description = "Conversation agent Lambda function name"
  value       = aws_lambda_function.conversation_agent.function_name
}

output "conversation_agent_function_arn" {
  description = "Conversation agent Lambda function ARN"
  value       = aws_lambda_function.conversation_agent.arn
}

# ── DynamoDB Outputs ──────────────────────────────────────────────

output "asset_state_table_name" {
  description = "Asset state DynamoDB table name"
  value       = aws_dynamodb_table.asset_state.name
}

output "incidents_table_name" {
  description = "Incidents DynamoDB table name"
  value       = aws_dynamodb_table.incidents.name
}
