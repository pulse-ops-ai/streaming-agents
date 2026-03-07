# Dev Environment Infrastructure
# Deploys to the sandbox AWS account via GitHub OIDC

locals {
  common_tags = {
    Environment = var.environment
    Project     = "streaming-agents"
    ManagedBy   = "terraform"
    Repository  = "pulse-ops-ai/streaming-agents"
  }

  # Lambda names that map to zip files produced by tools/bundle-lambda.ts
  lambda_names = [
    "simulator-controller",
    "simulator-worker",
    "ingestion",
    "signal-agent",
    "diagnosis-agent",
    "actions-agent",
    "conversation-agent",
  ]

  # Use real zip when artifacts path is set AND the file exists; otherwise placeholder
  lambda_zips = {
    for name in local.lambda_names :
    name => (
      var.lambda_artifacts_path != "" && fileexists("${var.lambda_artifacts_path}/${name}.zip")
      ? "${var.lambda_artifacts_path}/${name}.zip"
      : data.archive_file.lambda_placeholder.output_path
    )
  }

  lambda_hashes = {
    for name in local.lambda_names :
    name => (
      var.lambda_artifacts_path != "" && fileexists("${var.lambda_artifacts_path}/${name}.zip")
      ? filebase64sha256("${var.lambda_artifacts_path}/${name}.zip")
      : data.archive_file.lambda_placeholder.output_base64sha256
    )
  }
}

# ── DynamoDB Tables ───────────────────────────────────────────────

module "asset_state_table" {
  source = "../../modules/dynamodb"

  table_name   = "streaming-agents-asset-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "asset_id"

  attributes = [
    {
      name = "asset_id"
      type = "S"
    }
  ]

  tags = local.common_tags
}

module "incidents_table" {
  source = "../../modules/dynamodb"

  table_name   = "streaming-agents-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incident_id"

  attributes = [
    {
      name = "incident_id"
      type = "S"
    },
    {
      name = "asset_id"
      type = "S"
    },
    {
      name = "status"
      type = "S"
    }
  ]

  global_secondary_indexes = [
    {
      name            = "asset_id-status-index"
      hash_key        = "asset_id"
      range_key       = "status"
      projection_type = "ALL"
    }
  ]

  tags = local.common_tags
}

# ── Kinesis Streams ───────────────────────────────────────────────

module "r17_telemetry_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-telemetry"
  shard_count      = var.kinesis_shard_count
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_ingested_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-ingested"
  shard_count      = var.kinesis_shard_count
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_risk_events_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-risk-events"
  shard_count      = 1
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_diagnosis_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-diagnosis"
  shard_count      = 1
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

module "r17_actions_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-r17-actions"
  shard_count      = 1
  retention_period = var.kinesis_retention_period

  tags = local.common_tags
}

# ── SQS Dead Letter Queues ────────────────────────────────────────

resource "aws_sqs_queue" "r17_telemetry_dlq" {
  name = "streaming-agents-r17-telemetry-dlq"
  tags = local.common_tags
}

resource "aws_sqs_queue" "r17_ingested_dlq" {
  name = "streaming-agents-r17-ingested-dlq"
  tags = local.common_tags
}

resource "aws_sqs_queue" "r17_diagnosis_dlq" {
  name = "streaming-agents-r17-diagnosis-dlq"
  tags = local.common_tags
}

resource "aws_sqs_queue" "r17_actions_dlq" {
  name = "streaming-agents-r17-actions-dlq"
  tags = local.common_tags
}

# ── IAM Base ──────────────────────────────────────────────────────

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

# ── Lambda Placeholder ────────────────────────────────────────────

data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.terraform/lambda-placeholder.zip"

  source {
    content  = <<-EOT
      exports.handler = async (event) => {
        console.log('Placeholder handler - replace with real code');
        return { statusCode: 200, body: 'OK' };
      };
    EOT
    filename = "index.js"
  }
}

# ── Simulator Controller Lambda ──────────────────────────────────

resource "aws_iam_role" "simulator_controller" {
  name               = "streaming-agents-simulator-controller-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "simulator-controller" })
}

resource "aws_iam_role_policy_attachment" "simulator_controller_basic" {
  role       = aws_iam_role.simulator_controller.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "simulator_controller" {
  name = "streaming-agents-simulator-controller-policy"
  role = aws_iam_role.simulator_controller.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.simulator_worker.arn
      }
    ]
  })
}

resource "aws_lambda_function" "simulator_controller" {
  function_name = "streaming-agents-simulator-controller"
  role          = aws_iam_role.simulator_controller.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 256

  filename         = local.lambda_zips["simulator-controller"]
  source_code_hash = local.lambda_hashes["simulator-controller"]

  environment {
    variables = {
      NODE_ENV             = var.environment
      WORKER_FUNCTION_NAME = "streaming-agents-simulator-worker"
      DEFAULT_SCENARIO     = "mixed"
      SIM_WORKER_COUNT     = "2"
      SIM_BURST_COUNT      = "10"
      OTEL_SERVICE_NAME    = "simulator-controller"
    }
  }

  tags = merge(local.common_tags, { Service = "simulator-controller" })
}

# ── Simulator Worker Lambda ──────────────────────────────────────

resource "aws_iam_role" "simulator_worker" {
  name               = "streaming-agents-simulator-worker-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "simulator-worker" })
}

resource "aws_iam_role_policy_attachment" "simulator_worker_basic" {
  role       = aws_iam_role.simulator_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "simulator_worker" {
  name = "streaming-agents-simulator-worker-policy"
  role = aws_iam_role.simulator_worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords"]
        Resource = module.r17_telemetry_stream.stream_arn
      }
    ]
  })
}

resource "aws_lambda_function" "simulator_worker" {
  function_name = "streaming-agents-simulator-worker"
  role          = aws_iam_role.simulator_worker.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 90
  memory_size   = 256

  filename         = local.lambda_zips["simulator-worker"]
  source_code_hash = local.lambda_hashes["simulator-worker"]

  environment {
    variables = {
      NODE_ENV            = var.environment
      KINESIS_STREAM_NAME = module.r17_telemetry_stream.stream_name
      BATCH_SIZE          = "25"
      SIM_MAX_JITTER_MS   = "2000"
      OTEL_SERVICE_NAME   = "simulator-worker"
    }
  }

  tags = merge(local.common_tags, { Service = "simulator-worker" })
}

# ── Ingestion Service Lambda ─────────────────────────────────────

resource "aws_iam_role" "ingestion_service" {
  name               = "streaming-agents-ingestion-service-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "ingestion" })
}

resource "aws_iam_role_policy_attachment" "ingestion_service_basic" {
  role       = aws_iam_role.ingestion_service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ingestion_service" {
  name = "streaming-agents-ingestion-service-policy"
  role = aws_iam_role.ingestion_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:GetRecords", "kinesis:GetShardIterator", "kinesis:DescribeStream", "kinesis:ListStreams", "kinesis:ListShards"]
        Resource = module.r17_telemetry_stream.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords"]
        Resource = module.r17_ingested_stream.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.r17_telemetry_dlq.arn
      }
    ]
  })
}

resource "aws_lambda_function" "ingestion_service" {
  function_name = "streaming-agents-ingestion"
  role          = aws_iam_role.ingestion_service.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60
  memory_size   = 256

  filename         = local.lambda_zips["ingestion"]
  source_code_hash = local.lambda_hashes["ingestion"]

  environment {
    variables = {
      NODE_ENV              = var.environment
      KINESIS_INPUT_STREAM  = module.r17_telemetry_stream.stream_name
      KINESIS_OUTPUT_STREAM = module.r17_ingested_stream.stream_name
      DLQ_QUEUE_URL         = aws_sqs_queue.r17_telemetry_dlq.url
      BATCH_PARALLELISM     = "5"
      OTEL_SERVICE_NAME     = "ingestion"
    }
  }

  tags = merge(local.common_tags, { Service = "ingestion" })
}

resource "aws_lambda_event_source_mapping" "ingestion_kinesis" {
  event_source_arn                   = module.r17_telemetry_stream.stream_arn
  function_name                      = aws_lambda_function.ingestion_service.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.r17_telemetry_dlq.arn
    }
  }
}

# ── Signal Agent Lambda ──────────────────────────────────────────

resource "aws_iam_role" "signal_agent" {
  name               = "streaming-agents-signal-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "signal-agent" })
}

resource "aws_iam_role_policy_attachment" "signal_agent_basic" {
  role       = aws_iam_role.signal_agent.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "signal_agent" {
  name = "streaming-agents-signal-agent-policy"
  role = aws_iam_role.signal_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:GetRecords", "kinesis:GetShardIterator", "kinesis:DescribeStream", "kinesis:ListStreams", "kinesis:ListShards"]
        Resource = module.r17_ingested_stream.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords"]
        Resource = module.r17_risk_events_stream.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = module.asset_state_table.table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.r17_ingested_dlq.arn
      }
    ]
  })
}

resource "aws_lambda_function" "signal_agent" {
  function_name = "streaming-agents-signal-agent"
  role          = aws_iam_role.signal_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60
  memory_size   = 256

  filename         = local.lambda_zips["signal-agent"]
  source_code_hash = local.lambda_hashes["signal-agent"]

  environment {
    variables = {
      NODE_ENV               = var.environment
      KINESIS_INPUT_STREAM   = module.r17_ingested_stream.stream_name
      KINESIS_OUTPUT_STREAM  = module.r17_risk_events_stream.stream_name
      DYNAMODB_TABLE         = module.asset_state_table.table_name
      EMA_WINDOW             = "60"
      MIN_STDDEV             = "0.001"
      RISK_NORMALIZE_DIVISOR = "3.0"
      OTEL_SERVICE_NAME      = "signal-agent"
    }
  }

  tags = merge(local.common_tags, { Service = "signal-agent" })
}

resource "aws_lambda_event_source_mapping" "signal_agent_kinesis" {
  event_source_arn                   = module.r17_ingested_stream.stream_arn
  function_name                      = aws_lambda_function.signal_agent.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.r17_ingested_dlq.arn
    }
  }
}

# ── Diagnosis Agent Lambda ───────────────────────────────────────

resource "aws_iam_role" "diagnosis_agent" {
  name               = "streaming-agents-diagnosis-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "diagnosis-agent" })
}

resource "aws_iam_role_policy_attachment" "diagnosis_agent_basic" {
  role       = aws_iam_role.diagnosis_agent.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "diagnosis_agent" {
  name = "streaming-agents-diagnosis-agent-policy"
  role = aws_iam_role.diagnosis_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:GetRecords", "kinesis:GetShardIterator", "kinesis:DescribeStream", "kinesis:ListStreams", "kinesis:ListShards", "kinesis:SubscribeToShard"]
        Resource = module.r17_risk_events_stream.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords"]
        Resource = module.r17_diagnosis_stream.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
        Resource = module.asset_state_table.table_arn
      },
      {
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          "arn:aws:bedrock:*:*:inference-profile/us.anthropic.*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.r17_diagnosis_dlq.arn
      }
    ]
  })
}

resource "aws_lambda_function" "diagnosis_agent" {
  function_name = "streaming-agents-diagnosis-agent"
  role          = aws_iam_role.diagnosis_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60
  memory_size   = 512

  filename         = local.lambda_zips["diagnosis-agent"]
  source_code_hash = local.lambda_hashes["diagnosis-agent"]

  environment {
    variables = {
      NODE_ENV              = var.environment
      KINESIS_INPUT_STREAM  = module.r17_risk_events_stream.stream_name
      KINESIS_OUTPUT_STREAM = module.r17_diagnosis_stream.stream_name
      DLQ_QUEUE_URL         = aws_sqs_queue.r17_diagnosis_dlq.url
      DYNAMODB_TABLE        = module.asset_state_table.table_name
      BEDROCK_MODEL_ID      = "us.anthropic.claude-sonnet-4-6"
      BEDROCK_REGION        = var.aws_region
      DIAGNOSIS_DEBOUNCE_MS = "30000"
      OTEL_SERVICE_NAME     = "diagnosis-agent"
    }
  }

  tags = merge(local.common_tags, { Service = "diagnosis-agent" })
}

resource "aws_lambda_event_source_mapping" "diagnosis_agent_kinesis" {
  event_source_arn                   = module.r17_risk_events_stream.stream_arn
  function_name                      = aws_lambda_function.diagnosis_agent.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.r17_diagnosis_dlq.arn
    }
  }
}

# ── Actions Agent Lambda ─────────────────────────────────────────

resource "aws_iam_role" "actions_agent" {
  name               = "streaming-agents-actions-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "actions-agent" })
}

resource "aws_iam_role_policy_attachment" "actions_agent_basic" {
  role       = aws_iam_role.actions_agent.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "actions_agent" {
  name = "streaming-agents-actions-agent-policy"
  role = aws_iam_role.actions_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:GetRecords", "kinesis:GetShardIterator", "kinesis:DescribeStream", "kinesis:ListStreams", "kinesis:ListShards", "kinesis:SubscribeToShard"]
        Resource = module.r17_diagnosis_stream.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords"]
        Resource = module.r17_actions_stream.stream_arn
      },
      {
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = [
          module.incidents_table.table_arn,
          "${module.incidents_table.table_arn}/index/*",
          module.asset_state_table.table_arn
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.r17_actions_dlq.arn
      }
    ]
  })
}

resource "aws_lambda_function" "actions_agent" {
  function_name = "streaming-agents-actions-agent"
  role          = aws_iam_role.actions_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60
  memory_size   = 256

  filename         = local.lambda_zips["actions-agent"]
  source_code_hash = local.lambda_hashes["actions-agent"]

  environment {
    variables = {
      NODE_ENV                   = var.environment
      KINESIS_INPUT_STREAM       = module.r17_diagnosis_stream.stream_name
      KINESIS_OUTPUT_STREAM      = module.r17_actions_stream.stream_name
      DLQ_QUEUE_URL              = aws_sqs_queue.r17_actions_dlq.url
      DYNAMODB_INCIDENTS_TABLE   = module.incidents_table.table_name
      DYNAMODB_ASSET_STATE_TABLE = module.asset_state_table.table_name
      ESCALATION_THRESHOLD_MS    = "60000"
      OTEL_SERVICE_NAME          = "actions-agent"
    }
  }

  tags = merge(local.common_tags, { Service = "actions-agent" })
}

resource "aws_lambda_event_source_mapping" "actions_agent_kinesis" {
  event_source_arn                   = module.r17_diagnosis_stream.stream_arn
  function_name                      = aws_lambda_function.actions_agent.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  parallelization_factor             = 10
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.r17_actions_dlq.arn
    }
  }
}

# ── Conversation Agent Lambda ────────────────────────────────────

resource "aws_iam_role" "conversation_agent" {
  name               = "streaming-agents-conversation-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = merge(local.common_tags, { Service = "conversation-agent" })
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
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"]
        Resource = module.asset_state_table.table_arn
      },
      {
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:Scan"]
        Resource = [
          module.incidents_table.table_arn,
          "${module.incidents_table.table_arn}/index/*"
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
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          "arn:aws:bedrock:*:*:inference-profile/us.anthropic.*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "aws-marketplace:ViewSubscriptions",
          "aws-marketplace:Subscribe"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "conversation_agent" {
  function_name = "streaming-agents-conversation-agent"
  role          = aws_iam_role.conversation_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 512

  filename         = local.lambda_zips["conversation-agent"]
  source_code_hash = local.lambda_hashes["conversation-agent"]

  environment {
    variables = {
      NODE_ENV                 = var.environment
      DYNAMODB_ASSET_TABLE     = module.asset_state_table.table_name
      DYNAMODB_INCIDENTS_TABLE = module.incidents_table.table_name
      BEDROCK_MODEL_ID         = "us.anthropic.claude-sonnet-4-6"
      BEDROCK_REGION           = var.aws_region
      OTEL_SERVICE_NAME        = "conversation-agent"
    }
  }

  tags = merge(local.common_tags, { Service = "conversation-agent" })
}

resource "aws_lambda_permission" "lex_invoke_conversation_agent" {
  statement_id  = "AllowExecutionFromLex"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.conversation_agent.function_name
  principal     = "lexv2.amazonaws.com"
}

# ── Lex V2 Bot ───────────────────────────────────────────────────

module "lex" {
  source                 = "../../modules/lex"
  enable_lex             = true
  lambda_fulfillment_arn = aws_lambda_function.conversation_agent.arn
}

# ── EventBridge (Simulator Cron) ─────────────────────────────────

resource "aws_cloudwatch_event_rule" "simulator_cron" {
  name                = "streaming-agents-simulator-cron"
  schedule_expression = "rate(5 minutes)"
  state               = "DISABLED"
  tags                = local.common_tags
}

resource "aws_lambda_permission" "simulator_controller_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.simulator_controller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.simulator_cron.arn
}

resource "aws_cloudwatch_event_target" "simulator_controller" {
  rule = aws_cloudwatch_event_rule.simulator_cron.name
  arn  = aws_lambda_function.simulator_controller.arn
}
