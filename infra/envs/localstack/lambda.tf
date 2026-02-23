# Lambda Functions for Streaming Agents
# See: docs/ai/services/*.md for service contracts

# ── Placeholder Lambda Code ──────────────────────────────────────

# Create a minimal placeholder zip for Lambda deployment
# Real code deployment happens in Phase 2.5+
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

resource "aws_lambda_function" "simulator_controller" {
  function_name = "streaming-agents-simulator-controller"
  role          = aws_iam_role.simulator_controller.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV             = "localstack"
      AWS_REGION           = "us-east-1"
      WORKER_FUNCTION_NAME = "streaming-agents-simulator-worker"
      DEFAULT_SCENARIO     = "mixed"
      SIM_WORKER_COUNT     = "2"
      SIM_BURST_COUNT      = "10"
      OTEL_SERVICE_NAME    = "simulator-controller"
    }
  }

  tags = {
    Name        = "streaming-agents-simulator-controller"
    Environment = "localstack"
    Service     = "simulator-controller"
    Project     = "streaming-agents"
  }
}

# EventBridge permission for simulator-controller
resource "aws_lambda_permission" "simulator_controller_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.simulator_controller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.simulator_cron.arn
}

# EventBridge target
resource "aws_cloudwatch_event_target" "simulator_controller" {
  rule = aws_cloudwatch_event_rule.simulator_cron.name
  arn  = aws_lambda_function.simulator_controller.arn
}

# ── Simulator Worker Lambda ──────────────────────────────────────

resource "aws_lambda_function" "simulator_worker" {
  function_name = "streaming-agents-simulator-worker"
  role          = aws_iam_role.simulator_worker.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 90
  memory_size   = 256

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV            = "localstack"
      AWS_REGION          = "us-east-1"
      KINESIS_STREAM_NAME = aws_kinesis_stream.r17_telemetry.name
      BATCH_SIZE          = "25"
      SIM_MAX_JITTER_MS   = "2000"
      OTEL_SERVICE_NAME   = "simulator-worker"
    }
  }

  tags = {
    Name        = "streaming-agents-simulator-worker"
    Environment = "localstack"
    Service     = "simulator-worker"
    Project     = "streaming-agents"
  }
}

# ── Ingestion Service Lambda ─────────────────────────────────────

resource "aws_lambda_function" "ingestion_service" {
  function_name = "streaming-agents-ingestion"
  role          = aws_iam_role.ingestion_service.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 256

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV              = "localstack"
      AWS_REGION            = "us-east-1"
      KINESIS_INPUT_STREAM  = aws_kinesis_stream.r17_telemetry.name
      KINESIS_OUTPUT_STREAM = aws_kinesis_stream.r17_ingested.name
      DLQ_QUEUE_URL         = aws_sqs_queue.r17_telemetry_dlq.url
      BATCH_PARALLELISM     = "5"
      OTEL_SERVICE_NAME     = "ingestion"
    }
  }

  tags = {
    Name        = "streaming-agents-ingestion"
    Environment = "localstack"
    Service     = "ingestion"
    Project     = "streaming-agents"
  }
}

# Kinesis Event Source Mapping for Ingestion
resource "aws_lambda_event_source_mapping" "ingestion_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_telemetry.arn
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

resource "aws_lambda_function" "signal_agent" {
  function_name = "streaming-agents-signal-agent"
  role          = aws_iam_role.signal_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 256

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV               = "localstack"
      AWS_REGION             = "us-east-1"
      KINESIS_INPUT_STREAM   = aws_kinesis_stream.r17_ingested.name
      KINESIS_OUTPUT_STREAM  = aws_kinesis_stream.r17_risk_events.name
      DYNAMODB_TABLE         = aws_dynamodb_table.asset_state.name
      EMA_WINDOW             = "60"
      MIN_STDDEV             = "0.001"
      RISK_NORMALIZE_DIVISOR = "3.0"
      OTEL_SERVICE_NAME      = "signal-agent"
    }
  }

  tags = {
    Name        = "streaming-agents-signal-agent"
    Environment = "localstack"
    Service     = "signal-agent"
    Project     = "streaming-agents"
  }
}

# Kinesis Event Source Mapping for Signal Agent
resource "aws_lambda_event_source_mapping" "signal_agent_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_ingested.arn
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

# ── Phase 3: Diagnosis Agent Lambda ──────────────────────────────

resource "aws_lambda_function" "diagnosis_agent" {
  function_name = "streaming-agents-diagnosis-agent"
  role          = aws_iam_role.diagnosis_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 512 # Larger for Bedrock payloads

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV              = "localstack"
      AWS_REGION            = "us-east-1"
      KINESIS_INPUT_STREAM  = aws_kinesis_stream.r17_risk_events.name
      KINESIS_OUTPUT_STREAM = aws_kinesis_stream.r17_diagnosis.name
      DLQ_QUEUE_URL         = aws_sqs_queue.r17_diagnosis_dlq.url
      DYNAMODB_TABLE        = aws_dynamodb_table.asset_state.name
      BEDROCK_MODEL_ID      = "anthropic.claude-sonnet-4-20250514"
      BEDROCK_REGION        = "us-east-1"
      DIAGNOSIS_DEBOUNCE_MS = "30000"
      OTEL_SERVICE_NAME     = "diagnosis-agent"
    }
  }

  tags = {
    Name        = "streaming-agents-diagnosis-agent"
    Environment = "localstack"
    Service     = "diagnosis-agent"
    Project     = "streaming-agents"
  }
}

# Kinesis Event Source Mapping for Diagnosis Agent
resource "aws_lambda_event_source_mapping" "diagnosis_agent_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_risk_events.arn
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

# ── Phase 3: Actions Agent Lambda ────────────────────────────────

resource "aws_lambda_function" "actions_agent" {
  function_name = "streaming-agents-actions-agent"
  role          = aws_iam_role.actions_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 256

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV                   = "localstack"
      AWS_REGION                 = "us-east-1"
      KINESIS_INPUT_STREAM       = aws_kinesis_stream.r17_diagnosis.name
      KINESIS_OUTPUT_STREAM      = aws_kinesis_stream.r17_actions.name
      DLQ_QUEUE_URL              = aws_sqs_queue.r17_actions_dlq.url
      DYNAMODB_INCIDENTS_TABLE   = aws_dynamodb_table.incidents.name
      DYNAMODB_ASSET_STATE_TABLE = aws_dynamodb_table.asset_state.name
      ESCALATION_THRESHOLD_MS    = "60000"
      OTEL_SERVICE_NAME          = "actions-agent"
    }
  }

  tags = {
    Name        = "streaming-agents-actions-agent"
    Environment = "localstack"
    Service     = "actions-agent"
    Project     = "streaming-agents"
  }
}

# Kinesis Event Source Mapping for Actions Agent
resource "aws_lambda_event_source_mapping" "actions_agent_kinesis" {
  event_source_arn                   = aws_kinesis_stream.r17_diagnosis.arn
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
