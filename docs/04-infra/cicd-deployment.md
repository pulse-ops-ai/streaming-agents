# Deployment Guide

This document provides a complete guide for deploying the streaming-agents infrastructure using the GitHub Actions CI/CD pipeline.

## Overview

The deployment system uses a "build once, deploy many" strategy with:
- **Node.js 22.x** for TypeScript Lambdas (LTS until April 2027)
- **Python 3.12** for Python Lambdas
- **Terraform 1.5+** for infrastructure as code
- **GitHub OIDC** for secure AWS authentication
- **S3** for Lambda artifact storage
- **Multi-environment** support (dev, staging, prod)

## Quick Start

### 1. Bootstrap (One-Time Setup)

```bash
# Step 1: Create OIDC provider and IAM roles
cd infra/bootstrap/github-oidc
terraform init
terraform apply

# Save the role ARNs from output

# Step 2: Create Terraform state backend
cd ../terraform-state
terraform init
terraform apply
```

### 2. Configure GitHub Secrets

Add these secrets in **Settings → Secrets and variables → Actions**:

- `AWS_ROLE_DEV` - Dev deployment role ARN
- `AWS_ROLE_STAGING` - Staging deployment role ARN
- `AWS_ROLE_PROD` - Production deployment role ARN

### 3. Deploy

```bash
# Create a feature branch
git checkout -b feature/my-changes

# Make changes to Lambda code
# Push to GitHub - Lambda Build workflow runs automatically

# Create PR - Terraform plan runs and posts results
# Merge PR - Auto-deploys to dev

# Manual deploy to staging
# Go to Actions → Terraform Deploy → Run workflow
# Select: environment=staging, action=apply

# Manual deploy to prod (requires approval)
# Go to Actions → Terraform Deploy → Run workflow
# Select: environment=prod, action=apply
```

## Architecture

### Build Once, Deploy Many

```
┌─────────────────────────────────────────────────────────────┐
│ Feature Branch                                              │
│ ┌─────────────┐                                            │
│ │ Push Code   │ → Lambda Build → Artifacts (GitHub)       │
│ └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Main Branch                                                 │
│ ┌─────────────┐                                            │
│ │ Merge PR    │ → Lambda Build → Artifacts (S3)           │
│ └─────────────┘         ↓                                  │
│                   Terraform Deploy                          │
│                         ↓                                   │
│                   Auto-deploy to Dev                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Staging/Prod                                                │
│ ┌─────────────┐                                            │
│ │ Manual      │ → Download Artifacts (S3) → Deploy        │
│ │ Trigger     │    (same artifacts as dev)                 │
│ └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

### Workflow Files

- `.github/workflows/lambda-build.yml` - Builds Lambda artifacts
- `.github/workflows/terraform-deploy.yml` - Deploys infrastructure

### Infrastructure Structure

```
infra/
├── bootstrap/          # One-time setup
│   ├── github-oidc/   # OIDC provider + IAM roles
│   └── terraform-state/ # S3 + DynamoDB for state
├── modules/           # Reusable Terraform modules
│   ├── lambda/
│   ├── kinesis/
│   └── dynamodb/
└── envs/             # Environment configs
    ├── dev/
    ├── staging/
    └── prod/
```

## Environment Configuration

### Dev Environment
- **Node.js:** 22.x
- **Kinesis Shards:** 2
- **Lambda Memory:** 512MB
- **Lambda Timeout:** 30s
- **Log Level:** DEBUG
- **Auto-Shutdown:** Enabled (5pm-8am CST)
- **Deployment:** Automatic on merge to main

### Staging Environment
- **Node.js:** 22.x
- **Kinesis Shards:** 4
- **Lambda Memory:** 1024MB
- **Lambda Timeout:** 60s
- **Log Level:** INFO
- **Auto-Shutdown:** Enabled (5pm-8am CST)
- **Deployment:** Manual with approval

### Production Environment
- **Node.js:** 22.x
- **Kinesis Shards:** 8
- **Lambda Memory:** 2048MB
- **Lambda Timeout:** 120s
- **Log Level:** WARN
- **Auto-Shutdown:** DISABLED (always running)
- **Deployment:** Manual with approval

## Deployment Workflows

### Automatic Deployment (Dev)

Triggered on merge to `main`:

1. Lambda Build workflow runs
2. Artifacts uploaded to S3 with commit SHA
3. Terraform Deploy workflow runs
4. Downloads artifacts from S3
5. Deploys to dev environment

### Manual Deployment (Staging/Prod)

1. Navigate to **Actions** → **Terraform Deploy**
2. Click **Run workflow**
3. Select:
   - Environment: `staging` or `prod`
   - Terraform action: `apply`
4. Click **Run workflow**
5. Wait for approval (if required)
6. Deployment proceeds

## Artifact Management

### S3 Bucket Structure

```
streaming-agents-lambda-artifacts/
├── {commit-sha}/
│   ├── simulator-controller.zip
│   ├── simulator-worker.zip
│   ├── ingestion.zip
│   ├── signal-agent.zip
│   ├── diagnosis-agent.zip
│   ├── actions-agent.zip
│   ├── conversation-agent.zip
│   └── reachy-exporter.zip
└── latest/
    └── {branch-name}/
        └── *.zip
```

### Artifact Metadata

Each artifact includes:
- `commit` - Git commit SHA
- `branch` - Git branch name
- `build_time` - ISO 8601 timestamp

## Cost Optimization

### Auto-Shutdown (Dev & Staging)

Resources tagged with `AutoShutdown=true` are automatically disabled during off-hours:

- **Shutdown:** 5pm CST (23:00 UTC)
- **Startup:** 8am CST (14:00 UTC)
- **Affected:** EventBridge rules, Lambda ESMs
- **Not Affected:** Kinesis streams, DynamoDB tables
- **Savings:** ~60% of Lambda costs

### Production

Auto-shutdown is **DISABLED** in production - all resources run 24/7.

## Security

### OIDC Authentication

- No long-lived AWS credentials stored in GitHub
- Temporary credentials (1-hour lifetime)
- Environment-specific IAM roles
- Trust policies validate repository and environment

### IAM Permissions

Each environment has a dedicated IAM role with least-privilege permissions:
- Terraform state management (S3, DynamoDB)
- Lambda management
- Kinesis management
- DynamoDB management
- EventBridge management
- SQS management
- IAM management (for service roles)
- Secrets Manager (read-only)

### State Management

- S3 bucket with versioning enabled
- Server-side encryption with KMS
- DynamoDB locking prevents concurrent modifications
- Public access blocked

## Troubleshooting

### Build Failures

**TypeScript build fails:**
```bash
# Check dependencies
pnpm install

# Build locally
pnpm build

# Check for errors
pnpm --filter "@streaming-agents/my-lambda" bundle
```

**Python build fails:**
```bash
# Check uv installation
uv --version

# Install dependencies
cd python/services/my-lambda
uv sync

# Check for errors
uv pip compile pyproject.toml
```

### Deployment Failures

**Authentication error:**
- Verify IAM role ARN in GitHub secrets
- Check trust policy in IAM role
- Ensure repository and environment names match

**Artifact not found:**
- Verify Lambda Build workflow completed
- Check S3 bucket for artifacts
- Verify commit SHA matches

**Terraform state locked:**
```bash
# List locks
aws dynamodb scan \
  --table-name streaming-agents-tfstate-locks \
  --profile streaming-agents-sandbox-kong

# Force unlock (use with caution)
terraform force-unlock LOCK_ID
```

### Rollback

To rollback to a previous deployment:

1. Find the commit SHA of the working version
2. Run Terraform Deploy workflow
3. Select the environment
4. Terraform will use artifacts from that commit SHA

## Monitoring

### GitHub Actions

- View workflow runs in **Actions** tab
- Check logs for errors
- Review Terraform plans in PR comments

### AWS Resources

```bash
# Check Lambda functions
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `streaming-agents-`)].FunctionName' \
  --profile streaming-agents-sandbox-kong

# Check Kinesis streams
aws kinesis list-streams \
  --profile streaming-agents-sandbox-kong

# Check DynamoDB tables
aws dynamodb list-tables \
  --profile streaming-agents-sandbox-kong
```

## Best Practices

1. **Always test in dev first** before deploying to staging/prod
2. **Review Terraform plans** in PR comments before merging
3. **Use specific commit SHAs** for staging/prod deployments
4. **Monitor workflow runs** for failures
5. **Document deployment decisions** in PR descriptions
6. **Keep artifacts organized** with proper commit SHA tagging
7. **Test rollback procedures** in dev environment

## Support

For issues or questions:
- Check workflow logs in GitHub Actions
- Review Terraform plan output
- Consult `.github/workflows/README.md` for detailed workflow documentation
- Consult `infra/README.md` for infrastructure documentation
- Check the spec in `.kiro/specs/github-deployment-workflow/`

## Next Steps

1. ✅ Bootstrap infrastructure (OIDC, state backend)
2. ✅ Configure GitHub secrets
3. ⏳ Test Lambda Build workflow on feature branch
4. ⏳ Create PR and review Terraform plan
5. ⏳ Merge and verify dev deployment
6. ⏳ Deploy to staging for testing
7. ⏳ Plan production deployment with team
