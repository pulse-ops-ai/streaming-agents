# Local Development Credentials Bootstrap

This Terraform configuration creates an IAM user with static credentials for local dashboard and API development.

## What This Creates

1. **IAM User** - `streaming-agents-local-dev` with programmatic access only
2. **IAM Policies** - Least-privilege policies for:
   - DynamoDB read access (asset-state, incidents, asset-history)
   - Kinesis write access (for testing telemetry injection)
   - Lambda invoke access (for testing functions locally)
   - CloudWatch Logs read access (for debugging)
3. **Access Key** - Static credentials for local development

## Prerequisites

- AWS CLI configured with profile `streaming-agents-sandbox-kong`
- Administrative access to AWS account
- Terraform >= 1.5.0
- DynamoDB tables must exist (deployed via `infra/envs/dev`)

## Usage

### Initialize and Apply

```bash
cd infra/bootstrap/local-dev-credentials
terraform init
terraform plan
terraform apply
```

### Retrieve Credentials

After applying, get the credentials for local development:

```bash
# Get access key ID (not sensitive)
terraform output access_key_id

# Get secret access key (sensitive - handle carefully)
terraform output -raw secret_access_key

# Generate .env.local file automatically
terraform output -raw env_file_content > ../../../.env.local
```

### Configure Local Environment

#### Option 1: Environment Variables (Recommended)

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, etc.)
export AWS_ACCESS_KEY_ID="<access_key_id>"
export AWS_SECRET_ACCESS_KEY="<secret_access_key>"
export AWS_REGION="us-east-1"
```

#### Option 2: .env.local File

```bash
# Generate .env.local file
cd infra/bootstrap/local-dev-credentials
terraform output -raw env_file_content > ../../../.env.local

# The file will contain:
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# AWS_REGION=us-east-1
# DYNAMODB_ASSET_TABLE=streaming-agents-asset-state
# DYNAMODB_INCIDENTS_TABLE=streaming-agents-incidents
# DYNAMODB_HISTORY_TABLE=streaming-agents-asset-history
```

#### Option 3: AWS Credentials File

```bash
# Add to ~/.aws/credentials
[streaming-agents-local-dev]
aws_access_key_id = <access_key_id>
aws_secret_access_key = <secret_access_key>

# Add to ~/.aws/config
[profile streaming-agents-local-dev]
region = us-east-1
```

### Test Credentials

Verify the credentials work:

```bash
# Test DynamoDB access
aws dynamodb scan \
  --table-name streaming-agents-asset-state \
  --select COUNT \
  --profile streaming-agents-local-dev

# Test Kinesis access
aws kinesis describe-stream \
  --stream-name streaming-agents-r17-telemetry \
  --profile streaming-agents-local-dev

# Test Lambda access
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `streaming-agents-`)].FunctionName' \
  --profile streaming-agents-local-dev
```

## Resources Created

### IAM User
- **Name**: `streaming-agents-local-dev`
- **Access**: Programmatic only (no console access)
- **Tags**: Project, Service, Environment, ManagedBy

### IAM Policies (Inline)

#### Local Development Access
- **Name**: `local-dev-access`
- **DynamoDB Permissions**:
  - Read: `GetItem`, `BatchGetItem`, `Query`, `Scan`, `DescribeTable`
  - Write: `PutItem`, `UpdateItem`, `DeleteItem`, `BatchWriteItem`
  - Resources: `asset-state`, `incidents` (with GSI), `asset-history`
- **Kinesis Permissions**: `PutRecord`, `PutRecords`, `DescribeStream`
  - Resources: All `streaming-agents-r17-*` streams
- **Lambda Permissions**: `InvokeFunction`, `GetFunction`
  - Resources: All `streaming-agents-*` functions
- **CloudWatch Logs Permissions**: `DescribeLogGroups`, `DescribeLogStreams`, `GetLogEvents`, `FilterLogEvents`
  - Resources: All `/aws/lambda/streaming-agents-*` log groups
- **EventBridge Permissions**: `DescribeRule`, `ListRules`, `ListTargetsByRule`
  - Resources: All `streaming-agents-*` rules

### Access Key
- **Status**: Active
- **Output**: Access key ID (visible), Secret access key (sensitive)

## Security Considerations

### Least Privilege
The IAM policies grant only the minimum permissions needed for local development:
- **Read/write** access to DynamoDB tables (for admin API bootstrapping and testing)
- **Write access** to Kinesis streams (for testing telemetry injection)
- **Invoke access** to Lambda functions (for local testing)
- **Read-only** access to CloudWatch Logs (for debugging)
- **Read-only** access to EventBridge rules (for admin API cron status)
- No access to other AWS services or resources

### Credential Rotation
Rotate credentials regularly:

```bash
# Create new access key
aws iam create-access-key --user-name streaming-agents-local-dev

# Update your local environment with new credentials

# Delete old access key
aws iam delete-access-key \
  --user-name streaming-agents-local-dev \
  --access-key-id <OLD_KEY_ID>
```

### Cleanup
When you no longer need local development access:

```bash
cd infra/bootstrap/local-dev-credentials
terraform destroy
```

This will:
1. Delete the access key
2. Remove all IAM policies
3. Delete the IAM user

## Use Cases

### Dashboard Development

```typescript
// apps/dashboard/src/lib/aws-client.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
})
```

### API Development

```typescript
// apps/api/src/services/asset.service.ts
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

async getAssetHistory(assetId: string, minutes: number) {
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.DYNAMODB_HISTORY_TABLE,
    KeyConditionExpression: 'asset_id = :id AND #ts BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#ts': 'timestamp' },
    ExpressionAttributeValues: {
      ':id': assetId,
      ':from': new Date(Date.now() - minutes * 60000).toISOString(),
      ':to': new Date().toISOString()
    }
  }))
  return result.Items
}
```

### Testing Telemetry Injection

```bash
# Inject test telemetry event
aws kinesis put-record \
  --stream-name streaming-agents-r17-telemetry \
  --partition-key R-17 \
  --data '{"asset_id":"R-17","timestamp":"2026-03-10T14:00:00Z",...}' \
  --profile streaming-agents-local-dev
```

### Debugging Lambda Functions

```bash
# View recent Lambda logs
aws logs tail /aws/lambda/streaming-agents-signal-agent \
  --follow \
  --profile streaming-agents-local-dev

# Filter logs by trace ID
aws logs filter-log-events \
  --log-group-name /aws/lambda/streaming-agents-signal-agent \
  --filter-pattern "trace_id=abc123" \
  --profile streaming-agents-local-dev
```

## Outputs

- `user_arn` - ARN of the IAM user for reference
- `access_key_id` - Access key ID for local development
- `secret_access_key` - Secret access key (sensitive)
- `aws_region` - AWS region for the credentials
- `env_file_content` - Complete .env.local file content (sensitive)

## Troubleshooting

### Access Denied Errors

If you get access denied errors:

1. Verify the IAM user exists:
   ```bash
   aws iam get-user --user-name streaming-agents-local-dev
   ```

2. Verify the policies are attached:
   ```bash
   aws iam list-user-policies --user-name streaming-agents-local-dev
   ```

3. Verify the credentials are correct:
   ```bash
   aws sts get-caller-identity --profile streaming-agents-local-dev
   ```

### Table Not Found Errors

If DynamoDB tables are not found:

1. Verify the tables exist:
   ```bash
   aws dynamodb list-tables --query 'TableNames[?starts_with(@, `streaming-agents-`)]'
   ```

2. Ensure you've deployed the dev environment:
   ```bash
   cd infra/envs/dev
   terraform apply
   ```

### Credential Issues

If credentials aren't working:

1. Verify the access key is active:
   ```bash
   aws iam list-access-keys --user-name streaming-agents-local-dev
   ```

2. Check for typos in environment variables:
   ```bash
   echo $AWS_ACCESS_KEY_ID
   echo $AWS_SECRET_ACCESS_KEY
   ```

3. Ensure no extra whitespace or newlines in credentials

## Next Steps

After applying this configuration:

1. Generate .env.local file: `terraform output -raw env_file_content > ../../../.env.local`
2. Add .env.local to .gitignore (should already be there)
3. Test credentials with AWS CLI
4. Start developing dashboard/API locally
5. Use credentials in your local development environment

## References

- IAM Best Practices: https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- DynamoDB SDK: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-dynamodb/
- Kinesis SDK: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-kinesis/
