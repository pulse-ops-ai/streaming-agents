# IAM Roles and Policies for Lambda Functions
# See: docs/ai/architecture/lambda-patterns.md

# ── Lambda Execution Role (Base) ──────────────────────────────────

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

# ── Simulator Controller Lambda Role ──────────────────────────────

resource "aws_iam_role" "simulator_controller" {
  name               = "streaming-agents-simulator-controller-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "streaming-agents-simulator-controller-role"
    Environment = "localstack"
    Service     = "simulator-controller"
    Project     = "streaming-agents"
  }
}

resource "aws_iam_role_policy" "simulator_controller" {
  name = "streaming-agents-simulator-controller-policy"
  role = aws_iam_role.simulator_controller.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = "arn:aws:lambda:*:*:function:streaming-agents-simulator-worker"
      }
    ]
  })
}

# ── Simulator Worker Lambda Role ──────────────────────────────────

resource "aws_iam_role" "simulator_worker" {
  name               = "streaming-agents-simulator-worker-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "streaming-agents-simulator-worker-role"
    Environment = "localstack"
    Service     = "simulator-worker"
    Project     = "streaming-agents"
  }
}

resource "aws_iam_role_policy" "simulator_worker" {
  name = "streaming-agents-simulator-worker-policy"
  role = aws_iam_role.simulator_worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Resource = aws_kinesis_stream.r17_telemetry.arn
      }
    ]
  })
}

# ── Ingestion Service Lambda Role ─────────────────────────────────

resource "aws_iam_role" "ingestion_service" {
  name               = "streaming-agents-ingestion-service-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "streaming-agents-ingestion-service-role"
    Environment = "localstack"
    Service     = "ingestion-service"
    Project     = "streaming-agents"
  }
}

resource "aws_iam_role_policy" "ingestion_service" {
  name = "streaming-agents-ingestion-service-policy"
  role = aws_iam_role.ingestion_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStream",
          "kinesis:ListStreams"
        ]
        Resource = aws_kinesis_stream.r17_telemetry.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Resource = aws_kinesis_stream.r17_ingested.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.r17_telemetry_dlq.arn
      }
    ]
  })
}

# ── Signal Agent Lambda Role ──────────────────────────────────────

resource "aws_iam_role" "signal_agent" {
  name               = "streaming-agents-signal-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "streaming-agents-signal-agent-role"
    Environment = "localstack"
    Service     = "signal-agent"
    Project     = "streaming-agents"
  }
}

resource "aws_iam_role_policy" "signal_agent" {
  name = "streaming-agents-signal-agent-policy"
  role = aws_iam_role.signal_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStream",
          "kinesis:ListStreams"
        ]
        Resource = aws_kinesis_stream.r17_ingested.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Resource = aws_kinesis_stream.r17_risk_events.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.asset_state.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.r17_ingested_dlq.arn
      }
    ]
  })
}

# ── Phase 3: Diagnosis Agent Lambda Role ──────────────────────────

resource "aws_iam_role" "diagnosis_agent" {
  name               = "streaming-agents-diagnosis-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "streaming-agents-diagnosis-agent-role"
    Environment = "localstack"
    Service     = "diagnosis-agent"
    Project     = "streaming-agents"
  }
}

resource "aws_iam_role_policy" "diagnosis_agent" {
  name = "streaming-agents-diagnosis-agent-policy"
  role = aws_iam_role.diagnosis_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStream",
          "kinesis:ListStreams",
          "kinesis:SubscribeToShard"
        ]
        Resource = aws_kinesis_stream.r17_risk_events.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Resource = aws_kinesis_stream.r17_diagnosis.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.asset_state.arn
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = "arn:aws:bedrock:*::foundation-model/anthropic.*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.r17_diagnosis_dlq.arn
      }
    ]
  })
}

# ── Phase 3: Actions Agent Lambda Role ────────────────────────────

resource "aws_iam_role" "actions_agent" {
  name               = "streaming-agents-actions-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "streaming-agents-actions-agent-role"
    Environment = "localstack"
    Service     = "actions-agent"
    Project     = "streaming-agents"
  }
}

resource "aws_iam_role_policy" "actions_agent" {
  name = "streaming-agents-actions-agent-policy"
  role = aws_iam_role.actions_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStream",
          "kinesis:ListStreams",
          "kinesis:SubscribeToShard"
        ]
        Resource = aws_kinesis_stream.r17_diagnosis.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Resource = aws_kinesis_stream.r17_actions.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.incidents.arn,
          "${aws_dynamodb_table.incidents.arn}/index/*",
          aws_dynamodb_table.asset_state.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.r17_actions_dlq.arn
      }
    ]
  })
}

# ── Phase 4: Conversation Agent IAM ──────────────────────────────

resource "aws_iam_role" "conversation_agent" {
  name = "streaming-agents-conversation-agent-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "conversation_agent_basic" {
  role       = aws_iam_role.conversation_agent.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "conversation_agent_dynamodb" {
  name = "streaming-agents-conversation-agent-dynamodb"
  role = aws_iam_role.conversation_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.asset_state.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.incidents.arn,
          "${aws_dynamodb_table.incidents.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "conversation_agent_bedrock" {
  name = "streaming-agents-conversation-agent-bedrock"
  role = aws_iam_role.conversation_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = [
          "*"
        ]
      }
    ]
  })
}
