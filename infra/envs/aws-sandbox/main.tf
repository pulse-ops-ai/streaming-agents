# AWS Sandbox environment – main configuration

terraform {
  required_version = ">= 1.5"

  # backend "s3" {
  #   bucket = "streaming-agents-tfstate"
  #   key    = "sandbox/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

module "lex" {
  source                 = "../../modules/lex"
  enable_lex             = true
  lambda_fulfillment_arn = aws_lambda_function.conversation_agent.arn
}

resource "aws_dynamodb_table" "asset_state" {
  name         = "streaming-agents-asset-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "asset_id"
  attribute {
    name = "asset_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "incidents" {
  name         = "streaming-agents-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incident_id"
  attribute {
    name = "incident_id"
    type = "S"
  }
}
