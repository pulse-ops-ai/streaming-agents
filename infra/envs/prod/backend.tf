terraform {
  backend "s3" {
    bucket         = "streaming-agents-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:832931621664:key/436e6341-ef14-479e-90e4-06f447c67ad1"
    dynamodb_table = "streaming-agents-tfstate-locks"
    profile        = "streaming-agents-sandbox-kong"
  }
}
