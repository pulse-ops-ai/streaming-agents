# Amazon Managed Grafana (AMG) Workspace
# Dashboard for visualizing metrics, traces, and logs

resource "aws_grafana_workspace" "dashboard" {
  name                     = "streaming-agents-dashboard"
  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "SERVICE_MANAGED"

  data_sources = [
    "PROMETHEUS",
    "CLOUDWATCH",
    "XRAY"
  ]

  # Notification channels not needed for demo
  notification_destinations = []

  tags = {
    Name        = "streaming-agents-dashboard"
    Environment = "aws-sandbox"
    Project     = "streaming-agents"
    Purpose     = "observability-dashboard"
  }
}

# IAM role for Grafana to query data sources
resource "aws_iam_role" "grafana" {
  name = "streaming-agents-grafana-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "grafana.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "streaming-agents-grafana-role"
    Environment = "aws-sandbox"
    Project     = "streaming-agents"
  }
}

# Prometheus query permissions
resource "aws_iam_role_policy" "grafana_prometheus" {
  name = "streaming-agents-grafana-prometheus"
  role = aws_iam_role.grafana.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PrometheusQuery"
        Effect = "Allow"
        Action = [
          "aps:QueryMetrics",
          "aps:GetSeries",
          "aps:GetLabels",
          "aps:GetMetricMetadata"
        ]
        Resource = aws_prometheus_workspace.metrics.arn
      }
    ]
  })
}

# CloudWatch query permissions
resource "aws_iam_role_policy" "grafana_cloudwatch" {
  name = "streaming-agents-grafana-cloudwatch"
  role = aws_iam_role.grafana.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchRead"
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "cloudwatch:DescribeAlarms"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogsRead"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:GetLogGroupFields",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
          "logs:GetLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# X-Ray query permissions
resource "aws_iam_role_policy" "grafana_xray" {
  name = "streaming-agents-grafana-xray"
  role = aws_iam_role.grafana.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "XRayRead"
        Effect = "Allow"
        Action = [
          "xray:GetTraceSummaries",
          "xray:BatchGetTraces",
          "xray:GetServiceGraph",
          "xray:GetTimeSeriesServiceStatistics"
        ]
        Resource = "*"
      }
    ]
  })
}

# Associate Grafana workspace with IAM role
resource "aws_grafana_role_association" "admin" {
  role         = "ADMIN"
  workspace_id = aws_grafana_workspace.dashboard.id

  # Note: user_ids must be manually added after workspace creation
  # This requires IAM Identity Center to be configured
  # user_ids = ["<SSO_USER_ID>"]
}
