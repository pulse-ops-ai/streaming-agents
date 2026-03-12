# Observability IAM Policies
# X-Ray tracing permissions for all Lambda functions

resource "aws_iam_role_policy" "lambda_xray" {
  for_each = toset([
    aws_iam_role.simulator_controller.id,
    aws_iam_role.simulator_worker.id,
    aws_iam_role.ingestion_service.id,
    aws_iam_role.signal_agent.id,
    aws_iam_role.diagnosis_agent.id,
    aws_iam_role.actions_agent.id,
    aws_iam_role.conversation_agent.id
  ])

  name = "streaming-agents-xray-tracing"
  role = each.value

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "XRayTracing"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })
}
