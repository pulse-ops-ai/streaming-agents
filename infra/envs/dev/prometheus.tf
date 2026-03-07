# Amazon Managed Prometheus (AMP) Workspace
# Stores OTel metrics from Lambda functions

resource "aws_prometheus_workspace" "metrics" {
  alias = "streaming-agents-metrics-${var.environment}"

  tags = merge(local.common_tags, {
    Name    = "streaming-agents-metrics-${var.environment}"
    Purpose = "otel-metrics-storage"
  })
}

# IAM role policies for Lambda functions to write to Prometheus
# Applied to all Lambda execution roles

resource "aws_iam_role_policy" "lambda_prometheus_write" {
  for_each = toset([
    aws_iam_role.simulator_controller.id,
    aws_iam_role.simulator_worker.id,
    aws_iam_role.ingestion_service.id,
    aws_iam_role.signal_agent.id,
    aws_iam_role.diagnosis_agent.id,
    aws_iam_role.actions_agent.id,
    aws_iam_role.conversation_agent.id
  ])

  name = "streaming-agents-prometheus-write"
  role = each.value

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PrometheusRemoteWrite"
        Effect = "Allow"
        Action = [
          "aps:RemoteWrite"
        ]
        Resource = aws_prometheus_workspace.metrics.arn
      }
    ]
  })
}
