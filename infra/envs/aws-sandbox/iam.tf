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
