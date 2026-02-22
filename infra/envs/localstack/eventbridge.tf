# EventBridge Rules for Streaming Agents
# See: docs/ai/architecture/kinesis-topology.md

resource "aws_cloudwatch_event_rule" "simulator_cron" {
  name                = "streaming-agents-simulator-cron"
  description         = "Triggers simulator controller Lambda every minute"
  schedule_expression = "rate(1 minute)"
  state               = "ENABLED"

  tags = {
    Name        = "streaming-agents-simulator-cron"
    Environment = "localstack"
    Purpose     = "Simulator controller trigger"
    Project     = "streaming-agents"
  }
}

# Note: Event target will be added in Phase 2.5 when Lambda functions are created
# resource "aws_cloudwatch_event_target" "simulator_controller" {
#   rule = aws_cloudwatch_event_rule.simulator_cron.name
#   arn  = aws_lambda_function.simulator_controller.arn
# }
