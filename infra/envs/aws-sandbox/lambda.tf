# ── Placeholder Lambda Code ──────────────────────────────────────

# Create a minimal placeholder zip for Lambda deployment
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

# ── Phase 4: Conversation Agent Lambda ───────────────────────────

resource "aws_lambda_function" "conversation_agent" {
  function_name = "streaming-agents-conversation-agent"
  role          = aws_iam_role.conversation_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 512

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV                 = "aws-sandbox"
      AWS_REGION               = "us-east-1"
      DYNAMODB_ASSET_TABLE     = aws_dynamodb_table.asset_state.name
      DYNAMODB_INCIDENTS_TABLE = aws_dynamodb_table.incidents.name
      BEDROCK_MODEL_ID         = "anthropic.claude-sonnet-4-20250514"
      BEDROCK_REGION           = "us-east-1"
      OTEL_SERVICE_NAME        = "conversation-agent"
    }
  }

  tags = {
    Name        = "streaming-agents-conversation-agent"
    Environment = "aws-sandbox"
    Service     = "conversation-agent"
    Project     = "streaming-agents"
  }
}

resource "aws_lambda_permission" "lex_invoke_conversation_agent" {
  statement_id  = "AllowExecutionFromLex"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.conversation_agent.function_name
  principal     = "lexv2.amazonaws.com"
}
