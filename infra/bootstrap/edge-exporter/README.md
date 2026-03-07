# Edge Exporter IAM User Bootstrap

This Terraform configuration creates an IAM user with static credentials for the Reachy Mini robot to publish telemetry to Kinesis.

## What This Creates

1. **IAM User** - `streaming-agents-edge-exporter` with programmatic access only
2. **IAM Policy** - Least-privilege inline policy for Kinesis PutRecord/PutRecords
3. **Access Key** - Static credentials for the Raspberry Pi

## Prerequisites

- AWS CLI configured with profile `streaming-agents-sandbox-kong`
- Administrative access to AWS account
- Terraform >= 1.5.0
- Kinesis stream `streaming-agents-r17-telemetry` must exist (created by main infrastructure)

## Usage

### Initialize and Apply

```bash
cd infra/bootstrap/edge-exporter
terraform init
terraform plan
terraform apply
```

### Retrieve Credentials

After applying, get the credentials to configure on the Raspberry Pi:

```bash
# Get access key ID (not sensitive)
terraform output access_key_id

# Get secret access key (sensitive - handle carefully)
terraform output -raw secret_access_key
```

### Configure on Raspberry Pi

SSH into the Reachy Mini robot and set the credentials:

```bash
# Add to ~/.bashrc or ~/.profile
export AWS_ACCESS_KEY_ID="<access_key_id>"
export AWS_SECRET_ACCESS_KEY="<secret_access_key>"
export AWS_DEFAULT_REGION="us-east-1"

# Or create ~/.aws/credentials
mkdir -p ~/.aws
cat > ~/.aws/credentials << EOF
[default]
aws_access_key_id = <access_key_id>
aws_secret_access_key = <secret_access_key>
EOF

cat > ~/.aws/config << EOF
[default]
region = us-east-1
EOF
```

### Test Credentials

Verify the exporter can write to Kinesis:

```bash
# Test with AWS CLI
aws kinesis put-record \
  --stream-name streaming-agents-r17-telemetry \
  --partition-key test \
  --data "test-payload"
```

## Resources Created

### IAM User
- **Name**: `streaming-agents-edge-exporter`
- **Access**: Programmatic only (no console access)
- **Tags**: Project, Service, Environment, ManagedBy

### IAM Policy (Inline)
- **Name**: `kinesis-telemetry-write`
- **Permissions**: `kinesis:PutRecord`, `kinesis:PutRecords`
- **Resource**: `arn:aws:kinesis:*:ACCOUNT_ID:stream/streaming-agents-r17-telemetry`

### Access Key
- **Status**: Active
- **Output**: Access key ID (visible), Secret access key (sensitive)

## Security Considerations

### Least Privilege
The IAM policy grants only the minimum permissions needed:
- Write access to a single Kinesis stream
- No read, delete, or management permissions
- No access to other AWS services

### Credential Rotation
After the competition:
1. Rotate the access key: `aws iam create-access-key --user-name streaming-agents-edge-exporter`
2. Update credentials on the Pi
3. Delete the old key: `aws iam delete-access-key --user-name streaming-agents-edge-exporter --access-key-id OLD_KEY_ID`

### Cleanup
When the Reachy robot is no longer in use, delete the user and credentials:

```bash
cd infra/bootstrap/edge-exporter
terraform destroy
```

This will:
1. Delete the access key
2. Remove the IAM policy
3. Delete the IAM user

## Outputs

- `user_arn` - ARN of the IAM user for reference
- `access_key_id` - Access key ID to set on the Pi
- `secret_access_key` - Secret access key to set on the Pi (sensitive)
- `stream_arn` - ARN of the Kinesis stream the user can write to

## Troubleshooting

### Access Denied Errors
If the exporter gets access denied:
1. Verify the stream name matches: `streaming-agents-r17-telemetry`
2. Check the stream exists: `aws kinesis describe-stream --stream-name streaming-agents-r17-telemetry`
3. Verify credentials are set correctly on the Pi

### Credential Issues
If credentials aren't working:
1. Verify the access key is active: `aws iam list-access-keys --user-name streaming-agents-edge-exporter`
2. Check the secret wasn't truncated when copying
3. Ensure no extra whitespace in environment variables

## Next Steps

After applying this configuration:

1. Note the access key ID and secret from outputs
2. SSH to the Reachy Mini robot
3. Configure AWS credentials using one of the methods above
4. Test the connection with a sample PutRecord call
5. Start the telemetry exporter service
