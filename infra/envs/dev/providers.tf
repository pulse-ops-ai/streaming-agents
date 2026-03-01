terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Environment = "dev"
      Project     = "streaming-agents"
      ManagedBy   = "terraform"
      Repository  = "pulse-ops-ai/streaming-agents"
      AutoShutdown = "true"
    }
  }
}
