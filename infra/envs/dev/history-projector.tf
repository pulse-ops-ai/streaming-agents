# History Projector Lambda
# Fan-out processor that projects risk events into the history table

# ── History Table ─────────────────────────────────────────────────

module "asset_history_table" {
  source = "../../modules/dynamodb"

  table_name   = "streaming-agents-asset-history"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "asset_id"
  range_key    = "timestamp"

  attributes = [
    {
      name = "asset_id"
      type = "S"
    },
    {
      name = "timestamp"
      type = "S"
    }
  ]

  # Enable TTL for automatic cleanup (24h retention for demo)
  ttl_enabled        = true
  ttl_attribute_name = "expires_at"

  tags = local.common_tags
}

# ── History Projector Lambda ─────────────────────────────────────

resource "aws_iam_role" "history_projector" {
  name               = "streaming-agents-history-projector-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "history-projector" })
}

resource "aws_iam_role_policy_attachment" "history_projector_basic" {
  role       = aws_iam_role.history_projector.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "history_projector" {
  name = "streaming-agents-history-projector-policy"
  role = aws_iam_role.history_projector.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KinesisReadRiskEvents"
        Effect = "Allow"
        Action = [
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStream",
          "kinesis:ListStreams",
          "kinesis:ListShards"
        ]
        Resource = module.r17_risk_events_stream.stream_arn
      },
      {
        Sid      = "DynamoDBWriteHistory"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:BatchWriteItem"]
        Resource = module.asset_history_table.table_arn
      },
      {
        Sid      = "SQSSendDLQ"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.r17_risk_events_dlq.arn
      }
    ]
  })
}

resource "aws_lambda_function" "history_projector" {
  function_name = "streaming-agents-history-projector"
  role          = aws_iam_role.history_projector.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60
  memory_size   = 256

  filename         = local.lambda_zips["history-projector"]
  source_code_hash = local.lambda_hashes["history-projector"]

  environment {
    variables = {
      NODE_ENV               = var.environment
      KINESIS_INPUT_STREAM   = module.r17_risk_events_stream.stream_name
      DYNAMODB_HISTORY_TABLE = module.asset_history_table.table_name
      DLQ_QUEUE_URL          = aws_sqs_queue.r17_risk_events_dlq.url
      TTL_HOURS              = "24"
      BATCH_SIZE             = "25"
      OTEL_SERVICE_NAME      = "history-projector"
    }
  }

  # Enable X-Ray tracing
  tracing_config {
    mode = "Active"
  }

  tags = merge(local.common_tags, { Service = "history-projector" })
}

# ── Event Source Mapping ──────────────────────────────────────────

resource "aws_lambda_event_source_mapping" "history_projector_kinesis" {
  event_source_arn                   = module.r17_risk_events_stream.stream_arn
  function_name                      = aws_lambda_function.history_projector.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.r17_risk_events_dlq.arn
    }
  }
}

# ── DLQ for Risk Events ───────────────────────────────────────────

resource "aws_sqs_queue" "r17_risk_events_dlq" {
  name = "streaming-agents-r17-risk-events-dlq"
  tags = local.common_tags
}
