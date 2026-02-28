# LocalStack Restart Guide

## Architecture Overview

The streaming-agents pipeline runs 6 Lambda functions on LocalStack Pro with `docker-reuse` executor mode. EventBridge triggers the simulator controller every minute, which fans out to workers that feed the full pipeline.

**Per-minute pipeline:**
| Step | Lambda | Output |
|------|--------|--------|
| EventBridge cron | simulator-controller | Fans out 2 workers |
| Workers (2x) | simulator-worker | 2 x 10 = 20 telemetry records |
| Kinesis ESM | ingestion | 20 ingested records |
| Kinesis ESM | signal-agent | 20 risk events + DynamoDB state |
| Kinesis ESM | diagnosis-agent | DiagnosisEvents (debounced, MockBedrock locally) |
| Kinesis ESM | actions-agent | ActionEvents + incident lifecycle |

## Lambda Executor Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `docker-reuse` | One container per function, reused across invocations | **Default — use this** |
| `docker` | New container per invocation, zombie buildup risk | Never use for dev |
| `local` | In-process, no containers, memory accumulates in LocalStack | Fallback if docker-reuse issues |

**Current default:** `LAMBDA_EXECUTOR=docker-reuse` (set in `docker-compose.yml`)

## Restart Steps

### 1. Tear Down
```bash
# From repo root
make infra-down

# Or manually:
cd infra/envs/localstack && tflocal destroy -auto-approve
cd /path/to/repo && docker compose down -v
```

### 2. Clean Up Stale Containers (if any)
```bash
# Stop any leftover Lambda containers from docker-reuse mode
docker ps -q --filter "name=localstack-lambda" | xargs -r docker stop
docker ps -aq --filter "name=localstack-lambda" | xargs -r docker rm

# Verify
docker ps -a | grep lambda
```

### 3. Start Fresh
```bash
# Start LocalStack
docker compose up -d

# Wait for healthy
sleep 10

# Build, bundle, and deploy
pnpm build
npx tsx tools/bundle-lambda.ts
cd infra/envs/localstack && tflocal init && tflocal apply -auto-approve
```

### 4. Verify Deployment
```bash
# Check all 6 Lambda functions exist
awslocal lambda list-functions --query 'Functions[].FunctionName' --output table

# Expected:
# streaming-agents-simulator-controller
# streaming-agents-simulator-worker
# streaming-agents-ingestion
# streaming-agents-signal-agent
# streaming-agents-diagnosis-agent
# streaming-agents-actions-agent

# Check EventBridge rule
awslocal events describe-rule --name streaming-agents-simulator-cron --query 'State'
# "ENABLED" — simulator runs continuously

# Check Kinesis streams
awslocal kinesis list-streams --query 'StreamNames'
# 5 streams: r17-telemetry, r17-ingested, r17-risk-events, r17-diagnosis, r17-actions

# Check DynamoDB tables
awslocal dynamodb list-tables --query 'TableNames'
# 2 tables: streaming-agents-asset-state, streaming-agents-incidents

# Check SQS DLQs
awslocal sqs list-queues --query 'QueueUrls'
# 4 DLQs: r17-telemetry-dlq, r17-ingested-dlq, r17-diagnosis-dlq, r17-actions-dlq
```

### 5. Redeploy Lambda Code (Without Full Restart)
If you only need to push new code without tearing down infrastructure:
```bash
pnpm build
npx tsx tools/bundle-lambda.ts

# Deploy all 6 functions
for fn in simulator-controller simulator-worker ingestion signal-agent diagnosis-agent actions-agent; do
  awslocal lambda update-function-code \
    --function-name "streaming-agents-${fn}" \
    --zip-file "fileb://dist/lambdas/${fn}.zip"
done
```

## Testing After Restart

### Test 1: Single Worker (10 events)
```bash
awslocal lambda invoke \
  --function-name streaming-agents-simulator-worker \
  --cli-binary-format raw-in-base64-out \
  --payload '{"asset_id":"R-17","scenario":"degradation","seed":"test:R-17:1","burst_count":10}' \
  /tmp/worker-response.json

cat /tmp/worker-response.json
```

### Test 2: Verify Events in Kinesis
```bash
SHARD_ITERATOR=$(awslocal kinesis get-shard-iterator \
  --stream-name streaming-agents-r17-telemetry \
  --shard-id shardId-000000000000 \
  --shard-iterator-type TRIM_HORIZON \
  --query 'ShardIterator' --output text)

awslocal kinesis get-records \
  --shard-iterator "$SHARD_ITERATOR" \
  --limit 5 --query 'length(Records)'
```

### Test 3: Check Pipeline Health
```bash
# Wait for ESM processing
sleep 10

# Check DynamoDB asset state
awslocal dynamodb scan \
  --table-name streaming-agents-asset-state \
  --query 'Items[0].{asset_id:asset_id.S,risk_state:risk_state.S,reading_count:reading_count.N}' \
  --output table

# Check incidents table
awslocal dynamodb scan \
  --table-name streaming-agents-incidents \
  --query 'Count'
```

## Environment Variables

### docker-compose.yml
| Variable | Default | Purpose |
|----------|---------|---------|
| `LAMBDA_EXECUTOR` | `docker-reuse` | Container reuse mode (Pro/Ultimate) |
| `SIM_WORKER_COUNT` | `2` | Number of simulator workers per cycle |
| `SIM_BURST_COUNT` | `10` | Telemetry events per worker per cycle |
| `LOCALSTACK_AUTH_TOKEN` | (required) | Pro license key |

### Diagnosis Agent (NODE_ENV)
The diagnosis-agent uses `MockBedrockAdapter` when `NODE_ENV=local`. The Terraform currently sets `NODE_ENV=localstack` — update to `local` if you want mock Bedrock responses instead of real Bedrock calls.

## Troubleshooting

### "Connection refused" on Kinesis/DynamoDB
LocalStack internal service crashed. Restart the container:
```bash
docker compose restart localstack
```
If persistent, do a full teardown and restart (see steps above).

### ESM Not Processing
LocalStack ESM polling can be inconsistent. Check Lambda logs:
```bash
awslocal logs describe-log-groups --query 'logGroups[].logGroupName'
awslocal logs get-log-events \
  --log-group-name /aws/lambda/streaming-agents-ingestion \
  --log-stream-name $(awslocal logs describe-log-streams \
    --log-group-name /aws/lambda/streaming-agents-ingestion \
    --query 'logStreams[-1].logStreamName' --output text)
```

### Terraform State Corruption
If `tflocal apply` hangs or errors on state refresh after a crash:
```bash
cd infra/envs/localstack
rm -f terraform.tfstate terraform.tfstate.backup
rm -f localstack_providers_override.tf
tflocal init -reconfigure
tflocal apply -auto-approve
```

### docker-reuse Containers Not Cleaning Up
```bash
# List Lambda containers
docker ps -a --filter "name=localstack-lambda" --format '{{.Names}} {{.Status}}'

# Force cleanup
docker ps -aq --filter "name=localstack-lambda" | xargs -r docker rm -f
```
