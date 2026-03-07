output "user_arn" {
  description = "ARN of the edge exporter IAM user"
  value       = aws_iam_user.edge_exporter.arn
}

output "access_key_id" {
  description = "Access key ID for the edge exporter (set on Raspberry Pi)"
  value       = aws_iam_access_key.edge_exporter.id
}

output "secret_access_key" {
  description = "Secret access key for the edge exporter (set on Raspberry Pi)"
  value       = aws_iam_access_key.edge_exporter.secret
  sensitive   = true
}

output "stream_arn" {
  description = "ARN of the Kinesis stream the user can write to"
  value       = "arn:aws:kinesis:${var.aws_region}:${data.aws_caller_identity.current.account_id}:stream/${var.stream_name}"
}

output "lex_bot_arn" {
  description = "ARN of the Lex bot the user can access"
  value       = "arn:aws:lex:${var.aws_region}:${data.aws_caller_identity.current.account_id}:bot/${var.lex_bot_id}"
}

output "credentials_note" {
  description = "Note about credential usage"
  value       = "These credentials support both reachy-exporter (Kinesis) and reachy-voice (Lex + Polly)"
}
