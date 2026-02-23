# Terraform Layout

## Directory Structure

```
infra/
└── envs/
    └── localstack/           # LocalStack environment
        ├── providers.tf      # AWS provider pointing to localhost:4566
        ├── lambda.tf         # 4 Lambda functions + Kinesis ESM triggers
        ├── kinesis.tf        # 3 data streams (telemetry, ingested, risk-events)
        ├── dynamodb.tf       # asset-state table (per-asset EMA baselines)
        ├── iam.tf            # Lambda execution roles + service policies
        ├── eventbridge.tf    # Simulator cron (1 minute interval)
        ├── sqs.tf            # 2 dead letter queues
        └── outputs.tf        # All resource ARNs, names, and URLs
```

## Provider Configuration

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

## Future Environments

```
infra/
├── modules/              # Shared Terraform modules (Phase 3+)
│   ├── lambda/
│   ├── kinesis/
│   └── monitoring/
└── envs/
    ├── localstack/       # Local development
    └── sandbox/          # AWS sandbox (Phase 3+)
```
