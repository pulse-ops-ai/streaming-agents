# Edge Exporter IAM User Bootstrap

This Terraform configuration creates an IAM user with static credentials for the Reachy Mini robot to:
1. Publish telemetry to Kinesis (reachy-exporter service)
2. Interact with Lex bot for voice conversations (reachy-voice service)
3. Synthesize speech via Polly (for voice responses)

## What This Creates

1. **IAM User** - `streaming-agents-edge-exporter` with programmatic access only
2. **IAM Policies** - Least-privilege inline policies for:
   - Kinesis PutRecord/PutRecords (telemetry publishing)
   - Lex RecognizeUtterance/RecognizeText/DeleteSession/PutSession (voice interaction)
   - Polly SynthesizeSpeech (text-to-speech for voice responses)
3. **Access Key** - Static credentials for the Raspberry Pi

## Prerequisites

- AWS CLI configured with profile `streaming-agents-sandbox-kong`
- Administrative access to AWS account
- Terraform >= 1.5.0
- Kinesis stream `streaming-agents-r17-telemetry` must exist (created by main infrastructure)
- Lex bot `DQCBGQZ5XT` must exist (created by main infrastructure)

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
# Test Kinesis access
aws kinesis put-record \
  --stream-name streaming-agents-r17-telemetry \
  --partition-key test \
  --data "test-payload"
```

Verify the voice terminal can access Lex:

```bash
# Test Lex access
aws lexv2-runtime recognize-text \
  --bot-id DQCBGQZ5XT \
  --bot-alias-id TSTALIASID \
  --locale-id en_US \
  --session-id test-session \
  --text "hello"
```

Verify Polly access:

```bash
# Test Polly synthesis
aws polly synthesize-speech \
  --text "Hello from Reachy" \
  --output-format mp3 \
  --voice-id Joanna \
  test-output.mp3
```

## Resources Created

### IAM User
- **Name**: `streaming-agents-edge-exporter`
- **Access**: Programmatic only (no console access)
- **Tags**: Project, Service, Environment, ManagedBy

### IAM Policies (Inline)

#### Kinesis Telemetry Write
- **Name**: `kinesis-telemetry-write`
- **Permissions**: `kinesis:PutRecord`, `kinesis:PutRecords`
- **Resource**: `arn:aws:kinesis:*:ACCOUNT_ID:stream/streaming-agents-r17-telemetry`

#### Lex Bot Access
- **Name**: `lex-bot-access`
- **Permissions**:
  - `lex:RecognizeUtterance` - Send audio to Lex
  - `lex:RecognizeText` - Send text to Lex (laptop mode testing)
  - `lex:DeleteSession` - Clear conversation state
  - `lex:PutSession` - Manage conversation context
  - `polly:SynthesizeSpeech` - Generate speech audio
- **Resource**:
  - `arn:aws:lex:REGION:ACCOUNT_ID:bot-alias/DQCBGQZ5XT/*` (all aliases)
  - `arn:aws:lex:REGION:ACCOUNT_ID:bot/DQCBGQZ5XT` (bot itself)
  - `*` (Polly - no resource-level restrictions)

### Access Key
- **Status**: Active
- **Output**: Access key ID (visible), Secret access key (sensitive)

## Security Considerations

### Least Privilege
The IAM policies grant only the minimum permissions needed:
- Write access to a single Kinesis stream
- Read/interact access to a specific Lex bot (DQCBGQZ5XT only)
- Session management for conversation state
- Polly synthesis for voice responses
- No read, delete, or management permissions on any service
- No access to other AWS services or resources

### Lex Bot Access Scope
The policy is scoped to the specific streaming-agents Lex bot (ID: `DQCBGQZ5XT`):
- All bot aliases are accessible (allows dev/staging/prod aliases)
- Session management permissions for conversation state
- RecognizeText included for laptop mode testing

If you need to change the bot ID:
1. Update `terraform.tfvars`:
   ```hcl
   lex_bot_id = "NEW_BOT_ID"
   ```
2. Run `terraform apply` to update the policy

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
2. Remove the IAM policies (Kinesis and Lex)
3. Delete the IAM user

## Outputs

- `user_arn` - ARN of the IAM user for reference
- `access_key_id` - Access key ID to set on the Pi
- `secret_access_key` - Secret access key to set on the Pi (sensitive)
- `stream_arn` - ARN of the Kinesis stream the user can write to
- `lex_bot_arn` - ARN of the Lex bot the user can access
- `credentials_note` - Reminder that credentials support both services

## Troubleshooting

### Access Denied Errors
If the exporter or voice terminal gets access denied:
1. Verify the stream name matches: `streaming-agents-r17-telemetry`
2. Check the stream exists: `aws kinesis describe-stream --stream-name streaming-agents-r17-telemetry`
3. For Lex errors, verify the bot ID and alias ID match the policy (or use wildcards)
4. Verify credentials are set correctly on the Pi

### Lex Bot Not Found
If the voice terminal can't find the Lex bot:
1. Verify the bot is deployed: `aws lexv2-models describe-bot --bot-id DQCBGQZ5XT`
2. Check the bot alias exists: `aws lexv2-models list-bot-aliases --bot-id DQCBGQZ5XT`
3. Verify the region matches (`us-east-1` by default)
4. Check the policy allows the specific bot ID

### Polly Errors
If Polly synthesis fails:
1. Verify the voice ID is valid: `aws polly describe-voices --language-code en-US`
2. Check output format is supported (mp3, ogg_vorbis, pcm)
3. Ensure credentials are set correctly

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
4. Test Kinesis: `aws kinesis put-record --stream-name streaming-agents-r17-telemetry --partition-key test --data test`
5. Test Lex: `aws lexv2-runtime recognize-text --bot-id DQCBGQZ5XT --bot-alias-id TSTALIASID --locale-id en_US --session-id test --text hello`
6. Test Polly: `aws polly synthesize-speech --text "test" --output-format mp3 --voice-id Joanna test.mp3`
7. Start the reachy-exporter service
8. Toggle reachy-voice On in the dashboard
