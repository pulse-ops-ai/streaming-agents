# CloudWatch Dashboard
# Fallback and supplement to Grafana - works immediately without ADOT setup

resource "aws_cloudwatch_dashboard" "fleet_overview" {
  dashboard_name = "streaming-agents-fleet-overview-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Lambda Invocations
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.conversation_agent.function_name, { stat = "Sum", label = "conversation-agent" }],
            ["...", aws_lambda_function.signal_agent.function_name, { stat = "Sum", label = "signal-agent" }],
            ["...", aws_lambda_function.diagnosis_agent.function_name, { stat = "Sum", label = "diagnosis-agent" }],
            ["...", aws_lambda_function.actions_agent.function_name, { stat = "Sum", label = "actions-agent" }]
          ]
          view    = "timeSeries"
          stacked = true
          region  = var.aws_region
          title   = "Lambda Invocations"
          period  = 300
          yAxis = {
            left = {
              label = "Count"
            }
          }
        }
        width  = 12
        height = 6
        x      = 0
        y      = 0
      },
      # Row 1: Lambda Errors
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.conversation_agent.function_name, { stat = "Sum", label = "conversation-agent", color = "#d62728" }],
            ["...", aws_lambda_function.signal_agent.function_name, { stat = "Sum", label = "signal-agent", color = "#d62728" }],
            ["...", aws_lambda_function.diagnosis_agent.function_name, { stat = "Sum", label = "diagnosis-agent", color = "#d62728" }],
            ["...", aws_lambda_function.actions_agent.function_name, { stat = "Sum", label = "actions-agent", color = "#d62728" }]
          ]
          view    = "timeSeries"
          stacked = true
          region  = var.aws_region
          title   = "Lambda Errors"
          period  = 300
          yAxis = {
            left = {
              label = "Count"
            }
          }
        }
        width  = 12
        height = 6
        x      = 12
        y      = 0
      },
      # Row 2: Lambda Duration
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.signal_agent.function_name, { stat = "p50", label = "signal-agent p50" }],
            ["...", { stat = "p90", label = "signal-agent p90" }],
            ["...", { stat = "p99", label = "signal-agent p99" }]
          ]
          view   = "timeSeries"
          region = var.aws_region
          title  = "Lambda Duration (ms)"
          period = 300
          yAxis = {
            left = {
              label = "Milliseconds"
            }
          }
        }
        width  = 24
        height = 6
        x      = 0
        y      = 6
      },
      # Row 3: DynamoDB Consumed Capacity
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", module.asset_state_table.table_name, { stat = "Sum", label = "Asset State Read" }],
            ["...", module.incidents_table.table_name, { stat = "Sum", label = "Incidents Read" }],
            [".", "ConsumedWriteCapacityUnits", ".", module.asset_state_table.table_name, { stat = "Sum", label = "Asset State Write" }],
            ["...", module.incidents_table.table_name, { stat = "Sum", label = "Incidents Write" }]
          ]
          view   = "timeSeries"
          region = var.aws_region
          title  = "DynamoDB Consumed Capacity"
          period = 300
          yAxis = {
            left = {
              label = "Units"
            }
          }
        }
        width  = 24
        height = 6
        x      = 0
        y      = 12
      }
    ]
  })
}

# CloudWatch Log Groups for Lambda functions
resource "aws_cloudwatch_log_group" "conversation_agent" {
  name              = "/aws/lambda/${aws_lambda_function.conversation_agent.function_name}"
  retention_in_days = 7

  tags = {
    Name        = "conversation-agent-logs"
    Environment = var.environment
    Project     = "streaming-agents"
  }
}

# CloudWatch Alarms for critical metrics
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "streaming-agents-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Alert when Lambda errors exceed threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.conversation_agent.function_name
  }

  tags = {
    Name        = "lambda-errors-alarm"
    Environment = var.environment
    Project     = "streaming-agents"
  }
}
