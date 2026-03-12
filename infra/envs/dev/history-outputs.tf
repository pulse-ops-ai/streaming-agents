# History Read Model Outputs

output "history_table_name" {
  description = "Name of the asset history table"
  value       = module.asset_history_table.table_name
}

output "history_table_arn" {
  description = "ARN of the asset history table"
  value       = module.asset_history_table.table_arn
}

output "history_projector_function_name" {
  description = "Name of the history projector Lambda function"
  value       = aws_lambda_function.history_projector.function_name
}

output "history_projector_function_arn" {
  description = "ARN of the history projector Lambda function"
  value       = aws_lambda_function.history_projector.arn
}
