# Local Development Credentials Bootstrap
# Creates an IAM user with static credentials for local dashboard/API development

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
      Service    = "local-dev"
      ManagedBy  = "terraform"
      Repository = "pulse-ops-ai/streaming-agents"
      Purpose    = "local-development-credentials"
    }
  }
}

# ── Data Sources ──────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

# ── IAM User for Local Development ───────────────────────────────

resource "aws_iam_user" "local_dev" {
  name = "streaming-agents-local-dev"

  tags = {
    Name        = "Local Development User"
    Environment = var.environment
  }
}

# ── IAM Policy for Local Development ─────────────────────────────

resource "aws_iam_user_policy" "local_dev_access" {
  name = "local-dev-access"
  user = aws_iam_user.local_dev.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:DescribeTable",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/streaming-agents-asset-state",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/streaming-agents-incidents",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/streaming-agents-incidents/index/*",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/streaming-agents-asset-history"
        ]
      },
      {
        Sid    = "KinesisWrite"
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords",
          "kinesis:DescribeStream"
        ]
        Resource = [
          "arn:aws:kinesis:${var.aws_region}:${data.aws_caller_identity.current.account_id}:stream/streaming-agents-r17-*"
        ]
      },
      {
        Sid    = "LambdaInvoke"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction",
          "lambda:GetFunction"
        ]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:streaming-agents-*"
        ]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents",
          "logs:FilterLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/streaming-agents-*:*"
        ]
      },
      {
        Sid    = "EventBridgeRead"
        Effect = "Allow"
        Action = [
          "events:DescribeRule",
          "events:ListRules",
          "events:ListTargetsByRule"
        ]
        Resource = [
          "arn:aws:events:${var.aws_region}:${data.aws_caller_identity.current.account_id}:rule/streaming-agents-*"
        ]
      }
    ]
  })
}

# ── Access Key for Programmatic Access ───────────────────────────

resource "aws_iam_access_key" "local_dev" {
  user = aws_iam_user.local_dev.name
}
