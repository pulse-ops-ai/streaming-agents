# Infrastructure as Code

This directory contains Terraform configurations for deploying the streaming-agents infrastructure across multiple environments.

## Directory Structure

```
infra/
├── bootstrap/              # One-time setup resources
│   ├── github-oidc/       # GitHub Actions OIDC provider and IAM roles
│   └── terraform-state/   # S3 bucket and DynamoDB table for state management
├── modules/               # Reusable Terraform modules
│   ├── dynamodb/         # DynamoDB table module
│   ├── kinesis/          # Kinesis stream module
│   └── lambda/           # Lambda function module
└── envs/                 # Environment-specific configurations
    ├── localstack/       # Local development (LocalStack)
    ├── dev/              # Development environment (AWS)
    ├── staging/          # Staging environment (AWS)
    └── prod/             # Production environment (AWS)
```

## Environments

### LocalStack (Local Development)
- **Purpose**: Local testing and development
- **Endpoint**: `http://localhost:4566`
- **State**: Local file system
- **Resources**: Full stack for local testing

### Dev (AWS Development)
- **Purpose**: Development and testing in AWS
- **Kinesis Shards**: 2
- **Lambda Memory**: 512MB
- **Lambda Timeout**: 30s
- **Log Level**: DEBUG
- **Auto-Shutdown**: Enabled (5pm-8am CST)
- **State**: S3 (`streaming-agents-tfstate`, key: `dev/terraform.tfstate`)

### Staging (AWS Pre-Production)
- **Purpose**: Pre-production testing and validation
- **Kinesis Shards**: 4
- **Lambda Memory**: 1024MB
- **Lambda Timeout**: 60s
- **Log Level**: INFO
- **Auto-Shutdown**: Enabled (5pm-8am CST)
- **State**: S3 (`streaming-agents-tfstate`, key: `staging/terraform.tfstate`)

### Prod (AWS Production)
- **Purpose**: Production workloads
- **Kinesis Shards**: 8
- **Lambda Memory**: 2048MB
- **Lambda Timeout**: 120s
- **Log Level**: WARN
- **Auto-Shutdown**: DISABLED (always running)
- **State**: S3 (`streaming-agents-tfstate`, key: `prod/terraform.tfstate`)

## Prerequisites

1. **AWS CLI** configured with profile `streaming-agents-sandbox-kong`
2. **Terraform** >= 1.5.0
3. **GitHub Secrets** configured:
   - `AWS_ROLE_DEV` - IAM role ARN for dev deployments
   - `AWS_ROLE_STAGING` - IAM role ARN for staging deployments
   - `AWS_ROLE_PROD` - IAM role ARN for prod deployments

## Bootstrap Process

Before deploying to any environment, you must bootstrap the infrastructure:

### Step 1: Create OIDC Provider and IAM Roles

```bash
cd infra/bootstrap/github-oidc
terraform init
terraform plan
terraform apply
```

This creates:
- GitHub OIDC provider in AWS
- IAM roles for dev, staging, and prod environments
- IAM policies with least-privilege permissions

**Save the role ARNs** from the output and add them to GitHub repository secrets.

### Step 2: Create Terraform State Backend

```bash
cd infra/bootstrap/terraform-state
terraform init
terraform plan
terraform apply
```

This creates:
- S3 bucket for Terraform state (`streaming-agents-tfstate`)
- DynamoDB table for state locking (`streaming-agents-tfstate-locks`)
- KMS key for state encryption

## Deploying to Environments

### Local Deployment (LocalStack)

```bash
# Start LocalStack
docker-compose up -d localstack

# Deploy infrastructure
cd infra/envs/localstack
terraform init
terraform plan
terraform apply
```

### Dev Environment (Automatic via GitHub Actions)

Deployments to dev happen automatically when changes are merged to `main`:

1. Create a PR with infrastructure changes
2. GitHub Actions runs `terraform plan` for all environments
3. Review the plan in PR comments
4. Merge the PR
5. GitHub Actions automatically deploys to dev

### Staging Environment (Manual via GitHub Actions)

1. Go to **Actions** → **Terraform Deploy** → **Run workflow**
2. Select:
   - Environment: `staging`
   - Terraform action: `apply`
3. Click **Run workflow**
4. Deployment requires manual approval in GitHub

### Production Environment (Manual with Approval)

1. Go to **Actions** → **Terraform Deploy** → **Run workflow**
2. Select:
   - Environment: `prod`
   - Terraform action: `apply`
3. Click **Run workflow**
4. **Approval required** from designated reviewers
5. After approval, deployment proceeds

### Manual Deployment (Local)

For emergency deployments or testing:

```bash
# Dev environment
cd infra/envs/dev
terraform init
terraform plan
terraform apply

# Staging environment
cd infra/envs/staging
terraform init
terraform plan
terraform apply

# Production environment
cd infra/envs/prod
terraform init
terraform plan
terraform apply
```

## Modules

### DynamoDB Module

Creates a DynamoDB table with configurable attributes, GSIs, and TTL.

**Usage:**
```hcl
module "my_table" {
  source = "../../modules/dynamodb"

  table_name   = "streaming-agents-my-table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attributes = [
    { name = "id", type = "S" }
  ]

  tags = local.common_tags
}
```

### Kinesis Module

Creates a Kinesis stream with configurable shard count and retention.

**Usage:**
```hcl
module "my_stream" {
  source = "../../modules/kinesis"

  stream_name      = "streaming-agents-my-stream"
  shard_count      = 2
  retention_period = 24

  tags = local.common_tags
}
```

### Lambda Module

Creates a Lambda function with configurable memory, timeout, and X-Ray tracing.

**Usage:**
```hcl
module "my_function" {
  source = "../../modules/lambda"

  function_name = "streaming-agents-my-function"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  memory_size   = 512
  timeout       = 30
  role_arn      = aws_iam_role.my_function.arn
  source_path   = "dist/my-function.zip"

  environment_variables = {
    LOG_LEVEL = "INFO"
  }

  tags = local.common_tags
}
```

## State Management

### State Backend Configuration

Each environment uses S3 for remote state:

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

### State Locking

DynamoDB provides state locking to prevent concurrent modifications:
- Lock acquired before `terraform plan` or `terraform apply`
- Lock released after operation completes
- Prevents state corruption from concurrent runs

### State Versioning

S3 versioning is enabled on the state bucket:
- Every state change creates a new version
- Old versions retained for 90 days
- Enables rollback to previous states if needed

## Cost Optimization

### Auto-Shutdown (Dev & Staging Only)

Resources tagged with `AutoShutdown=true` are automatically disabled during off-hours:

**Schedule:**
- Shutdown: 5pm CST (23:00 UTC)
- Startup: 8am CST (14:00 UTC)

**Affected Resources:**
- EventBridge rules (stops simulator triggers)
- Lambda Event Source Mappings (stops Kinesis processing)

**Not Affected:**
- Kinesis streams (continue running)
- DynamoDB tables (always available)
- Lambda functions (available on-demand)

**Estimated Savings:** ~60% of Lambda costs during off-hours

**Production:** Auto-shutdown is DISABLED in production (always running)

## Tagging Strategy

All resources are tagged with:
- `Environment` - dev, staging, or prod
- `Project` - streaming-agents
- `ManagedBy` - terraform
- `Repository` - pulse-ops-ai/streaming-agents
- `AutoShutdown` - true/false (controls cost optimization)

## Troubleshooting

### State Lock Issues

If a deployment fails and leaves the state locked:

```bash
# List locks
aws dynamodb scan \
  --table-name streaming-agents-tfstate-locks \
  --profile streaming-agents-sandbox-kong

# Force unlock (use with caution)
terraform force-unlock LOCK_ID
```

### Authentication Issues

If GitHub Actions fails to assume the IAM role:

1. Verify the role ARN in GitHub secrets
2. Check the trust policy in the IAM role
3. Ensure the repository and environment names match

### Plan Failures

If `terraform plan` fails:

1. Check AWS credentials are configured
2. Verify backend configuration is correct
3. Run `terraform init` to refresh providers
4. Check for syntax errors with `terraform validate`

## Security Best Practices

1. **No Long-Lived Credentials**: Uses OIDC for temporary credentials
2. **Least-Privilege IAM**: Roles have minimal required permissions
3. **State Encryption**: State files encrypted with KMS
4. **State Locking**: Prevents concurrent modifications
5. **Environment Isolation**: Separate roles and state per environment
6. **Audit Trail**: All deployments logged in GitHub Actions

## Next Steps

1. Review the bootstrap outputs and save role ARNs
2. Configure GitHub repository secrets
3. Test deployment to dev environment
4. Review and approve staging deployment
5. Plan production deployment with team

## Support

For issues or questions:
- Check GitHub Actions logs for deployment errors
- Review Terraform plan output before applying
- Consult the design document in `.kiro/specs/github-deployment-workflow/`
