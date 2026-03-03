# GitHub OIDC Provider and IAM Roles for CI/CD
# This bootstrap configuration creates the OIDC provider and IAM roles
# needed for GitHub Actions to deploy infrastructure via Terraform.

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
      ManagedBy  = "terraform"
      Repository = "pulse-ops-ai/streaming-agents"
      Purpose    = "github-actions-bootstrap"
    }
  }
}

# ── GitHub OIDC Provider ──────────────────────────────────────────

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]

  tags = {
    Name = "GitHub Actions OIDC Provider"
  }
}

# ── IAM Roles for Each Environment ───────────────────────────────

locals {
  environments = ["dev", "staging", "prod"]
  github_repo  = "${var.github_org}/${var.github_repo}"
}

resource "aws_iam_role" "github_deploy" {
  for_each = toset(local.environments)

  name        = "streaming-agents-github-deploy-${each.key}"
  description = "Role for GitHub Actions to deploy ${each.key} environment"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:${local.github_repo}:environment:${each.key}"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "GitHub Deploy Role - ${each.key}"
    Environment = each.key
  }
}

# ── IAM Policies for Deployment ──────────────────────────────────

resource "aws_iam_policy" "terraform_state_access" {
  name        = "streaming-agents-terraform-state-access"
  description = "Allows access to Terraform state bucket and lock table"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3StateAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.terraform_state_bucket}",
          "arn:aws:s3:::${var.terraform_state_bucket}/*"
        ]
      },
      {
        Sid    = "DynamoDBLockAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:DescribeTable"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${var.aws_account_id}:table/${var.terraform_lock_table}"
      },
      {
        Sid    = "KMSAccess"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_policy" "lambda_management" {
  name        = "streaming-agents-lambda-management"
  description = "Allows management of Lambda functions and related resources"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaFunctionManagement"
        Effect = "Allow"
        Action = [
          "lambda:CreateFunction",
          "lambda:DeleteFunction",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:ListFunctions",
          "lambda:ListVersionsByFunction",
          "lambda:PublishVersion",
          "lambda:CreateAlias",
          "lambda:UpdateAlias",
          "lambda:DeleteAlias",
          "lambda:GetAlias",
          "lambda:TagResource",
          "lambda:UntagResource",
          "lambda:ListTags"
        ]
        Resource = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:streaming-agents-*"
      },
      {
        Sid    = "LambdaEventSourceMapping"
        Effect = "Allow"
        Action = [
          "lambda:CreateEventSourceMapping",
          "lambda:DeleteEventSourceMapping",
          "lambda:GetEventSourceMapping",
          "lambda:UpdateEventSourceMapping",
          "lambda:ListEventSourceMappings"
        ]
        Resource = "*"
      },
      {
        Sid    = "LambdaPermissions"
        Effect = "Allow"
        Action = [
          "lambda:AddPermission",
          "lambda:RemovePermission",
          "lambda:GetPolicy"
        ]
        Resource = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:streaming-agents-*"
      }
    ]
  })
}

resource "aws_iam_policy" "kinesis_management" {
  name        = "streaming-agents-kinesis-management"
  description = "Allows management of Kinesis streams"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KinesisStreamManagement"
        Effect = "Allow"
        Action = [
          "kinesis:CreateStream",
          "kinesis:DeleteStream",
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:ListStreams",
          "kinesis:ListTagsForStream",
          "kinesis:AddTagsToStream",
          "kinesis:RemoveTagsFromStream",
          "kinesis:UpdateShardCount",
          "kinesis:IncreaseStreamRetentionPeriod",
          "kinesis:DecreaseStreamRetentionPeriod"
        ]
        Resource = "arn:aws:kinesis:${var.aws_region}:${var.aws_account_id}:stream/streaming-agents-*"
      }
    ]
  })
}

resource "aws_iam_policy" "dynamodb_management" {
  name        = "streaming-agents-dynamodb-management"
  description = "Allows management of DynamoDB tables"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableManagement"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:ListTables",
          "dynamodb:ListTagsOfResource",
          "dynamodb:TagResource",
          "dynamodb:UntagResource",
          "dynamodb:UpdateTable",
          "dynamodb:UpdateTimeToLive"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${var.aws_account_id}:table/streaming-agents-*"
      }
    ]
  })
}

resource "aws_iam_policy" "eventbridge_management" {
  name        = "streaming-agents-eventbridge-management"
  description = "Allows management of EventBridge rules and targets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EventBridgeRuleManagement"
        Effect = "Allow"
        Action = [
          "events:PutRule",
          "events:DeleteRule",
          "events:DescribeRule",
          "events:EnableRule",
          "events:DisableRule",
          "events:ListRules",
          "events:ListTagsForResource",
          "events:TagResource",
          "events:UntagResource"
        ]
        Resource = "arn:aws:events:${var.aws_region}:${var.aws_account_id}:rule/streaming-agents-*"
      },
      {
        Sid    = "EventBridgeTargetManagement"
        Effect = "Allow"
        Action = [
          "events:PutTargets",
          "events:RemoveTargets",
          "events:ListTargetsByRule"
        ]
        Resource = "arn:aws:events:${var.aws_region}:${var.aws_account_id}:rule/streaming-agents-*"
      }
    ]
  })
}

resource "aws_iam_policy" "sqs_management" {
  name        = "streaming-agents-sqs-management"
  description = "Allows management of SQS queues"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SQSQueueManagement"
        Effect = "Allow"
        Action = [
          "sqs:CreateQueue",
          "sqs:DeleteQueue",
          "sqs:GetQueueAttributes",
          "sqs:SetQueueAttributes",
          "sqs:ListQueues",
          "sqs:ListQueueTags",
          "sqs:TagQueue",
          "sqs:UntagQueue"
        ]
        Resource = "arn:aws:sqs:${var.aws_region}:${var.aws_account_id}:streaming-agents-*"
      }
    ]
  })
}

resource "aws_iam_policy" "iam_management" {
  name        = "streaming-agents-iam-management"
  description = "Allows management of IAM roles and policies for Lambda service roles"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "IAMRoleManagement"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:ListRoles",
          "iam:UpdateRole",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:ListRoleTags"
        ]
        Resource = "arn:aws:iam::${var.aws_account_id}:role/streaming-agents-*"
      },
      {
        Sid    = "IAMPolicyManagement"
        Effect = "Allow"
        Action = [
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicies",
          "iam:ListPolicyVersions",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:TagPolicy",
          "iam:UntagPolicy"
        ]
        Resource = "arn:aws:iam::${var.aws_account_id}:policy/streaming-agents-*"
      },
      {
        Sid    = "IAMRolePolicyAttachment"
        Effect = "Allow"
        Action = [
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:ListRolePolicies"
        ]
        Resource = "arn:aws:iam::${var.aws_account_id}:role/streaming-agents-*"
      },
      {
        Sid      = "IAMPassRole"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = "arn:aws:iam::${var.aws_account_id}:role/streaming-agents-*"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = [
              "lambda.amazonaws.com",
              "events.amazonaws.com",
              "lexv2.amazonaws.com"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_iam_policy" "secrets_manager_read" {
  name        = "streaming-agents-secrets-manager-read"
  description = "Allows read access to Secrets Manager secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManagerRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecrets"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:streaming-agents/*"
      }
    ]
  })
}

resource "aws_iam_policy" "s3_management" {
  name        = "streaming-agents-s3-management"
  description = "Allows management of S3 buckets for Lambda artifacts and application data"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3BucketManagement"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning",
          "s3:GetBucketPublicAccessBlock",
          "s3:PutBucketPublicAccessBlock",
          "s3:GetBucketTagging",
          "s3:PutBucketTagging"
        ]
        Resource = "arn:aws:s3:::streaming-agents-*"
      },
      {
        Sid    = "S3ObjectManagement"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListMultipartUploadParts",
          "s3:AbortMultipartUpload"
        ]
        Resource = "arn:aws:s3:::streaming-agents-*/*"
      },
      {
        Sid    = "S3ListAllBuckets"
        Effect = "Allow"
        Action = [
          "s3:ListAllMyBuckets"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_policy" "lex_management" {
  name        = "streaming-agents-lex-management"
  description = "Allows management of Lex V2 bots and related resources"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LexBotManagement"
        Effect = "Allow"
        Action = [
          "lex:CreateBot",
          "lex:DeleteBot",
          "lex:DescribeBot",
          "lex:UpdateBot",
          "lex:ListBots",
          "lex:CreateBotLocale",
          "lex:DeleteBotLocale",
          "lex:DescribeBotLocale",
          "lex:UpdateBotLocale",
          "lex:BuildBotLocale",
          "lex:CreateIntent",
          "lex:DeleteIntent",
          "lex:DescribeIntent",
          "lex:UpdateIntent",
          "lex:ListIntents",
          "lex:CreateSlot",
          "lex:DeleteSlot",
          "lex:DescribeSlot",
          "lex:UpdateSlot",
          "lex:ListSlots",
          "lex:CreateSlotType",
          "lex:DeleteSlotType",
          "lex:DescribeSlotType",
          "lex:UpdateSlotType",
          "lex:ListSlotTypes",
          "lex:CreateBotVersion",
          "lex:DeleteBotVersion",
          "lex:DescribeBotVersion",
          "lex:ListBotVersions",
          "lex:CreateBotAlias",
          "lex:DeleteBotAlias",
          "lex:DescribeBotAlias",
          "lex:UpdateBotAlias",
          "lex:ListBotAliases",
          "lex:TagResource",
          "lex:UntagResource",
          "lex:ListTagsForResource"
        ]
        Resource = "*"
      }
    ]
  })
}

# ── Attach Policies to Roles ──────────────────────────────────────

resource "aws_iam_role_policy_attachment" "github_deploy_state" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.terraform_state_access.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_lambda" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.lambda_management.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_kinesis" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.kinesis_management.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_dynamodb" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.dynamodb_management.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_eventbridge" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.eventbridge_management.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_sqs" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.sqs_management.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_iam" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.iam_management.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_secrets" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.secrets_manager_read.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_s3" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.s3_management.arn
}

resource "aws_iam_role_policy_attachment" "github_deploy_lex" {
  for_each = toset(local.environments)

  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = aws_iam_policy.lex_management.arn
}
