# Terraform State Backend Infrastructure

This Terraform configuration creates the S3 bucket and DynamoDB table needed for remote state management.

## What This Creates

1. **KMS Key** - For encrypting Terraform state at rest
2. **S3 Bucket** - Stores Terraform state files with versioning enabled
3. **DynamoDB Table** - Provides state locking to prevent concurrent modifications

## Prerequisites

- AWS CLI configured with profile `streaming-agents-sandbox-kong`
- Administrative access to AWS account
- Terraform >= 1.5.0

## Usage

### Initialize and Apply

```bash
cd infra/bootstrap/terraform-state
terraform init
terraform plan
terraform apply
```

### Get Backend Configuration

After applying, note the outputs for use in environment-specific backend configurations:

```bash
terraform output
```

## Resources Created

### S3 Bucket
- **Name**: `streaming-agents-tfstate` (globally unique)
- **Versioning**: Enabled (keeps history of state changes)
- **Encryption**: AWS KMS with automatic key rotation
- **Public Access**: Blocked (all public access denied)
- **Lifecycle**: Old versions expire after 90 days

### DynamoDB Table
- **Name**: `streaming-agents-tfstate-locks`
- **Billing**: Pay-per-request (no provisioned capacity)
- **Hash Key**: `LockID` (string)
- **Purpose**: Prevents concurrent Terraform operations

### KMS Key
- **Alias**: `alias/streaming-agents-tfstate`
- **Key Rotation**: Enabled (automatic annual rotation)
- **Deletion Window**: 10 days (safety buffer)

## Security Features

- Server-side encryption with KMS
- Versioning enabled for state recovery
- Public access completely blocked
- State lock prevents concurrent modifications
- Automatic key rotation for encryption

## Backend Configuration Example

After creating these resources, configure your environment-specific Terraform to use this backend:

```hcl
# infra/envs/dev/backend.tf
terraform {
  backend "s3" {
    bucket         = "streaming-agents-tfstate"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"
    dynamodb_table = "streaming-agents-tfstate-locks"
  }
}
```

Replace `ACCOUNT_ID` and `KEY_ID` with values from `terraform output`.

## State Recovery

If you need to recover a previous state version:

```bash
# List all versions
aws s3api list-object-versions \
  --bucket streaming-agents-tfstate \
  --prefix dev/terraform.tfstate

# Download a specific version
aws s3api get-object \
  --bucket streaming-agents-tfstate \
  --key dev/terraform.tfstate \
  --version-id VERSION_ID \
  terraform.tfstate.backup
```

## Next Steps

After applying this configuration:

1. Note the bucket name and KMS key ARN from outputs
2. Update the IAM policies in `infra/bootstrap/github-oidc` if bucket name changed
3. Proceed to Task 3: Create Terraform module structure
