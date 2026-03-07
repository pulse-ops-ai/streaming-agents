# Edge Exporter IAM User for Reachy Robot
# This bootstrap configuration creates an IAM user with static credentials
# for the Reachy Mini robot to publish telemetry to Kinesis.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project    = "streaming-agents"
      Service    = "reachy-exporter"
      ManagedBy  = "terraform"
      Repository = "pulse-ops-ai/streaming-agents"
      Purpose    = "edge-device-credentials"
    }
  }
}

# ── Data Sources ──────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

# ── IAM User for Edge Device ──────────────────────────────────────

resource "aws_iam_user" "edge_exporter" {
  name = "streaming-agents-edge-exporter"

  tags = {
    Name        = "Reachy Edge Exporter"
    Environment = var.environment
  }
}

# ── IAM Policy for Kinesis Write Access ──────────────────────────

resource "aws_iam_user_policy" "kinesis_write" {
  name = "kinesis-telemetry-write"
  user = aws_iam_user.edge_exporter.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KinesisPutRecords"
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Resource = "arn:aws:kinesis:*:${data.aws_caller_identity.current.account_id}:stream/${var.stream_name}"
      }
    ]
  })
}

# ── Access Key for Programmatic Access ───────────────────────────

resource "aws_iam_access_key" "edge_exporter" {
  user = aws_iam_user.edge_exporter.name
}
