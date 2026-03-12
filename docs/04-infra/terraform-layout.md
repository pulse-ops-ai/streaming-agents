# Terraform Layout

## Directory Structure

```
infra/
├── bootstrap/              # One-time setup resources
│   ├── github-oidc/       # GitHub Actions OIDC provider and IAM roles
│   └── terraform-state/   # S3 bucket and DynamoDB table for state management
├── modules/               # Reusable Terraform modules
│   ├── lambda/           # Lambda function module
│   ├── kinesis/          # Kinesis stream module
│   ├── dynamodb/         # DynamoDB table module
│   ├── apigw/            # API Gateway module (placeholder)
│   ├── iot/              # IoT module (placeholder)
│   ├── lex/              # Lex bot module
│   └── s3/               # S3 bucket module (placeholder)
└── envs/                 # Environment-specific configurations
    ├── localstack/       # Local development (LocalStack)
    ├── dev/              # Development environment (AWS)
    ├── staging/          # Staging environment (AWS)
    └── prod/             # Production environment (AWS)
```

## Environment Configurations

### LocalStack (Local Development)

LocalStack uses test credentials with all validation skipped:

```hcl
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "<localstack-key>"
  secret_key                  = "<localstack-key>"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    # All services point to LocalStack gateway
    kinesis    = "http://localhost:4566"
    dynamodb   = "http://localhost:4566"
    lambda     = "http://localhost:4566"
    # ... (all services)
  }
}
```

### AWS Environments (Dev, Staging, Prod)

Each AWS environment has:
- `main.tf` - Resource definitions using modules
- `backend.tf` - S3 state backend configuration
- `variables.tf` - Environment variables
- `terraform.tfvars` - Environment-specific values
- `providers.tf` - AWS provider configuration with default tags

**State Backend:**
```hcl
terraform {
  backend "s3" {
    bucket         = "streaming-agents-tfstate"
    key            = "dev/terraform.tfstate"  # or staging/prod
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"
    dynamodb_table = "streaming-agents-tfstate-locks"
    profile        = "streaming-agents-sandbox-kong"
  }
}
```

## Resource Naming

All resources use the `streaming-agents-` prefix:

| Resource Type | Name Pattern | Example |
|---------------|-------------|---------|
| Lambda | `streaming-agents-{service}` | `streaming-agents-signal-agent` |
| Kinesis | `streaming-agents-r17-{stage}` | `streaming-agents-r17-ingested` |
| DynamoDB | `streaming-agents-{table}` | `streaming-agents-asset-state` |
| SQS | `streaming-agents-r17-{stage}-dlq` | `streaming-agents-r17-telemetry-dlq` |
| IAM Role | `streaming-agents-{service}-role` | `streaming-agents-ingestion-service-role` |

## Tooling

- **tflocal**: Terraform wrapper that automatically points to LocalStack (`terraform-local` pip package)
- **awslocal**: AWS CLI alias with test credentials and LocalStack endpoint
- **Terraform**: Version 1.5+ for AWS environments

## CI/CD Integration

See [CI/CD Deployment Guide](./cicd-deployment.md) for:
- GitHub Actions workflows
- Build once, deploy many strategy
- Lambda artifact management
- Multi-environment deployment
