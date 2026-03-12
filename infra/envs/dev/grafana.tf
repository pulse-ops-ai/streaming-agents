# Amazon Managed Grafana (AMG) Workspace
# Dashboard for visualizing metrics, traces, and logs

resource "aws_grafana_workspace" "dashboard" {
  name                     = "streaming-agents-dashboard-${var.environment}"
  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "SERVICE_MANAGED"
  role_arn                 = aws_iam_role.grafana.arn

  data_sources = [
    "PROMETHEUS",
    "CLOUDWATCH",
    "XRAY"
  ]

  notification_destinations = []

  tags = merge(local.common_tags, {
    Name    = "streaming-agents-dashboard-${var.environment}"
    Purpose = "observability-dashboard"
  })
}

# IAM role for Grafana to query data sources
resource "aws_iam_role" "grafana" {
  name = "streaming-agents-grafana-role-${var.environment}"

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

  tags = merge(local.common_tags, {
    Name = "streaming-agents-grafana-role-${var.environment}"
  })
}

# Prometheus query permissions
resource "aws_iam_role_policy" "grafana_prometheus" {
  name = "streaming-agents-grafana-prometheus"
  role = aws_iam_role.grafana.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PrometheusDiscovery"
        Effect = "Allow"
        Action = [
          "aps:ListWorkspaces",
          "aps:DescribeWorkspace"
        ]
        Resource = "*"
      },
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

# Admin role association — add SSO user after deploy:
#   aws grafana create-workspace-service-account \
#     --workspace-id <ID> --grafana-role ADMIN --name admin
# Or use: aws identitystore list-users --identity-store-id d-9067c077a6
# Then uncomment and add user_id below:
#
# resource "aws_grafana_role_association" "admin" {
#   role         = "ADMIN"
#   workspace_id = aws_grafana_workspace.dashboard.id
#   user_ids     = ["<SSO_USER_ID>"]
# }
