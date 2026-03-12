# GitHub Actions OIDC Bootstrap

This Terraform configuration creates the AWS infrastructure needed for GitHub Actions to deploy via OIDC authentication.

## What This Creates

1. **GitHub OIDC Provider** - Enables GitHub Actions to authenticate with AWS
2. **IAM Deployment Roles** - Three roles (dev, staging, prod) for environment-specific deployments
3. **IAM Policies** - Least-privilege policies for Terraform operations

## Prerequisites

- AWS CLI configured with profile `streaming-agents-sandbox-kong`
- Administrative access to AWS account
- Terraform >= 1.5.0

## Usage

### Initialize and Apply

```bash
cd infra/bootstrap/github-oidc
terraform init
terraform plan
terraform apply
```

### Get Role ARNs for GitHub Secrets

After applying, get the role ARNs to configure in GitHub:

```bash
terraform output github_deploy_role_arns
```

Add these to your GitHub repository secrets:
- `AWS_ROLE_DEV` - ARN for dev environment
- `AWS_ROLE_STAGING` - ARN for staging environment
- `AWS_ROLE_PROD` - ARN for prod environment

## Resources Created

### OIDC Provider
- **Name**: `token.actions.githubusercontent.com`
- **Client ID**: `sts.amazonaws.com`
- **Thumbprint**: Auto-fetched from GitHub

### IAM Roles
- `streaming-agents-github-deploy-dev`
- `streaming-agents-github-deploy-staging`
- `streaming-agents-github-deploy-prod`

### IAM Policies
- `streaming-agents-terraform-state-access` - S3 and DynamoDB access
- `streaming-agents-lambda-management` - Lambda function management
- `streaming-agents-kinesis-management` - Kinesis stream management
- `streaming-agents-dynamodb-management` - DynamoDB table management
- `streaming-agents-eventbridge-management` - EventBridge rule management
- `streaming-agents-sqs-management` - SQS queue management
- `streaming-agents-iam-management` - IAM role/policy management
- `streaming-agents-secrets-manager-read` - Secrets Manager read access

## Trust Policy

Each role trusts GitHub Actions from:
- **Repository**: `pulse-ops-ai/streaming-agents`
- **Environment**: Matches role name (dev, staging, or prod)

The trust policy validates:
- Repository owner and name
- GitHub environment name
- OIDC audience (`sts.amazonaws.com`)

## Next Steps

After applying this configuration:

1. Note the role ARNs from `terraform output`
2. Add role ARNs to GitHub repository secrets
3. Proceed to Task 2: Set up Terraform state backend infrastructure
