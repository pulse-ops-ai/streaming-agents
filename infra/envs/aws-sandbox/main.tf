# AWS Sandbox environment – main configuration

terraform {
  required_version = ">= 1.5"

  # backend "s3" {
  #   bucket = "streaming-agents-tfstate"
  #   key    = "sandbox/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

# module "dynamodb" {
#   source = "../../modules/dynamodb"
# }
#
# module "kinesis" {
#   source = "../../modules/kinesis"
# }
