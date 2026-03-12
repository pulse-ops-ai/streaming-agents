terraform {
  backend "s3" {
    bucket         = "streaming-agents-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000000"
    dynamodb_table = "streaming-agents-tfstate-locks"
    profile        = "streaming-agents-sandbox-kong"
  }
}
