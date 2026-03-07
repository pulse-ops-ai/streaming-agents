# Amazon Managed Prometheus (AMP) Workspace
# Stores OTel metrics from Lambda functions

resource "aws_prometheus_workspace" "metrics" {
  alias = "streaming-agents-metrics"

  tags = {
    Name        = "streaming-agents-metrics"
    Environment = "aws-sandbox"
    Project     = "streaming-agents"
    Purpose     = "otel-metrics-storage"
  }
}

# IAM role for Lambda functions to write to Prometheus
resource "aws_iam_role_policy" "lambda_prometheus_write" {
  name = "streaming-agents-prometheus-write"
  role = aws_iam_role.conversation_agent.id

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
