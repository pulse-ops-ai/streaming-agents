# GitHub Actions Workflows

This directory contains CI/CD workflows for the streaming-agents project.

## Workflows

### 1. Lambda Build (`lambda-build.yml`)

**Purpose:** Build Lambda function deployment artifacts using a "build once, deploy many" strategy.

**Triggers:**
- Push to any branch when Lambda code changes
- Pull requests with Lambda code changes
- Manual workflow dispatch

**Jobs:**
1. **build-typescript** - Builds all TypeScript Lambda functions
   - Uses Node.js 22 (LTS until April 2027)
   - Uses pnpm for dependency management
   - Bundles with esbuild via `tools/bundle-lambda.ts`
   - Creates ZIP deployment packages
   - Uploads artifacts to GitHub Actions

2. **build-python** - Builds all Python Lambda functions
   - Uses uv for dependency management
   - Compiles requirements with pip
   - Creates ZIP deployment packages
   - Uploads artifacts to GitHub Actions

3. **upload-to-s3** - Uploads artifacts to S3 (main branch only)
   - Downloads built artifacts
   - Creates S3 bucket if needed (`streaming-agents-lambda-artifacts`)
   - Uploads with commit SHA prefix: `s3://bucket/{commit-sha}/{lambda}.zip`
   - Also uploads as "latest" for the branch: `s3://bucket/latest/{branch}/{lambda}.zip`

**Artifacts:**
- Retention: 30 days in GitHub Actions
- Permanent storage: S3 bucket (versioned)
- Naming: `{lambda-name}.zip`
- Metadata: commit SHA, branch, build time

**Build Once, Deploy Many:**
- Artifacts are built once per commit
- Same artifact deployed to dev, staging, and prod
- Ensures consistency across environments
- Reduces build time for deployments

### 2. Terraform Deploy (`terraform-deploy.yml`)

**Purpose:** Deploy infrastructure changes using Terraform with OIDC authentication.

**Triggers:**
- Push to main (auto-deploy to dev)
- Pull requests (validation and planning)
- Manual workflow dispatch (staging/prod)

**Jobs:**
1. **validate** - Validates Terraform configuration
   - Runs `terraform fmt -check`
   - Runs `terraform validate`
   - Runs on pull requests only

2. **plan** - Plans Terraform changes for all environments
   - Runs `terraform plan` for dev, staging, and prod
   - Posts plan output as PR comment
   - Runs on pull requests only

3. **deploy-dev** - Auto-deploys to dev environment
   - Downloads Lambda artifacts from S3 (by commit SHA)
   - Runs `terraform apply -auto-approve`
   - Runs on push to main only

4. **deploy-staging** - Manual deploy to staging
   - Downloads Lambda artifacts from S3 (by commit SHA)
   - Requires manual workflow dispatch
   - Requires approval from designated reviewers

5. **deploy-prod** - Manual deploy to production
   - Downloads Lambda artifacts from S3 (by commit SHA)
   - Requires manual workflow dispatch
   - Requires approval from designated reviewers

**Authentication:**
- Uses GitHub OIDC for AWS authentication
- No long-lived credentials stored
- Environment-specific IAM roles:
  - `AWS_ROLE_DEV` - Dev environment role ARN
  - `AWS_ROLE_STAGING` - Staging environment role ARN
  - `AWS_ROLE_PROD` - Production environment role ARN

## Workflow Execution Flow

### Feature Branch Development

```
1. Developer pushes Lambda code changes to feature branch
   ↓
2. Lambda Build workflow runs
   ↓
3. Artifacts uploaded to GitHub Actions (30-day retention)
   ↓
4. Developer creates PR
   ↓
5. Terraform Deploy workflow runs validation and plan
   ↓
6. Plan posted as PR comment for review
```

### Merge to Main (Dev Deployment)

```
1. PR merged to main
   ↓
2. Lambda Build workflow runs
   ↓
3. Artifacts uploaded to S3 with commit SHA
   ↓
4. Terraform Deploy workflow runs
   ↓
5. Downloads artifacts from S3 (by commit SHA)
   ↓
6. Auto-deploys to dev environment
```

### Staging Deployment

```
1. Navigate to Actions → Terraform Deploy → Run workflow
   ↓
2. Select environment: staging, action: apply
   ↓
3. Workflow downloads artifacts from S3 (by commit SHA)
   ↓
4. Approval required from designated reviewers
   ↓
5. After approval, deploys to staging
```

### Production Deployment

```
1. Navigate to Actions → Terraform Deploy → Run workflow
   ↓
2. Select environment: prod, action: apply
   ↓
3. Workflow downloads artifacts from S3 (by commit SHA)
   ↓
4. Approval required from designated reviewers
   ↓
5. After approval, deploys to production
```

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
        ├── simulator-controller.zip
        └── ...
```

### Artifact Metadata

Each artifact in S3 includes metadata:
- `commit` - Git commit SHA
- `branch` - Git branch name
- `build_time` - ISO 8601 timestamp

### Artifact Lifecycle

1. **Build** - Created by Lambda Build workflow
2. **Upload** - Stored in S3 with commit SHA
3. **Deploy** - Downloaded by Terraform Deploy workflow
4. **Retention** - Kept indefinitely in S3 (versioned)

## Environment Configuration

### Dev Environment
- **Auto-deploy:** Yes (on merge to main)
- **Approval:** Not required
- **Artifacts:** Latest from main branch
- **IAM Role:** `AWS_ROLE_DEV`

### Staging Environment
- **Auto-deploy:** No (manual workflow dispatch)
- **Approval:** Required
- **Artifacts:** Specific commit SHA
- **IAM Role:** `AWS_ROLE_STAGING`

### Production Environment
- **Auto-deploy:** No (manual workflow dispatch)
- **Approval:** Required (designated reviewers)
- **Artifacts:** Specific commit SHA
- **IAM Role:** `AWS_ROLE_PROD`

## Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

- `AWS_ROLE_DEV` - ARN of the dev deployment IAM role
- `AWS_ROLE_STAGING` - ARN of the staging deployment IAM role
- `AWS_ROLE_PROD` - ARN of the production deployment IAM role

Example:
```
AWS_ROLE_DEV=arn:aws:iam::ACCOUNT_ID:role/streaming-agents-github-deploy-dev
AWS_ROLE_STAGING=arn:aws:iam::ACCOUNT_ID:role/streaming-agents-github-deploy-staging
AWS_ROLE_PROD=arn:aws:iam::ACCOUNT_ID:role/streaming-agents-github-deploy-prod
```

## Troubleshooting

### Build Failures

**TypeScript build fails:**
- Check pnpm-lock.yaml is up to date
- Verify all dependencies are installed
- Check for TypeScript compilation errors

**Python build fails:**
- Check pyproject.toml dependencies
- Verify uv is installed correctly
- Check for Python syntax errors

### Deployment Failures

**Authentication errors:**
- Verify IAM role ARNs in GitHub secrets
- Check trust policy in IAM role
- Ensure OIDC provider is configured

**Artifact not found:**
- Verify Lambda Build workflow completed successfully
- Check S3 bucket exists and has artifacts
- Verify commit SHA matches

**Terraform errors:**
- Check Terraform state is not locked
- Verify backend configuration is correct
- Review Terraform plan output

### Manual Artifact Upload

If you need to manually upload artifacts:

```bash
# Build locally
pnpm build
pnpm --filter "@streaming-agents/my-lambda" bundle

# Upload to S3
aws s3 cp dist/my-lambda.zip \
  s3://streaming-agents-lambda-artifacts/manual/my-lambda.zip \
  --profile streaming-agents-sandbox-kong
```

## Best Practices

1. **Always review Terraform plans** before approving deployments
2. **Test in dev first** before deploying to staging/prod
3. **Use specific commit SHAs** for staging/prod deployments
4. **Monitor workflow runs** for failures and errors
5. **Keep artifacts organized** with proper commit SHA tagging
6. **Document deployment decisions** in PR descriptions

## Security Considerations

- OIDC tokens are short-lived (1 hour)
- No AWS credentials stored in GitHub
- Artifacts are private (S3 bucket blocks public access)
- Deployments require approval for staging/prod
- All actions logged and auditable

## Next Steps

1. Configure GitHub secrets with IAM role ARNs
2. Test Lambda Build workflow on a feature branch
3. Create a PR and review Terraform plan
4. Merge to main and verify dev deployment
5. Manually deploy to staging for testing
6. Plan production deployment with team
