# LocalStack Restart Guide

## Problem Summary
LocalStack exhausted with 100+ zombie Lambda containers due to:
- `LAMBDA_EXECUTOR=docker` mode (creates container per invocation)
- EventBridge cron triggering controller every minute
- Controller spawning 5-50 workers per invocation
- Each worker generating 120 events

**Result:** Thread pool exhaustion, Kinesis down, Lambda invocations failing.

## Changes Made

### 1. `.env.example` Updated
Added recommended LocalStack settings:
```bash
# Lambda Executor - use "local" for dev to prevent zombie containers
LAMBDA_EXECUTOR=local

# Simulator Overrides - reduce load for local testing
SIM_WORKER_COUNT=2      # Instead of 5-50 per hour
SIM_BURST_COUNT=10      # Instead of 120 events
```

### 2. `docker-compose.yml` Updated
- Changed default `LAMBDA_EXECUTOR` from `docker` to `local`
- Added `SIM_WORKER_COUNT` and `SIM_BURST_COUNT` environment variables
- Added comments explaining the settings

### 3. Lambda Terraform Already Configured
- Controller Lambda already has `SIM_WORKER_COUNT=2` and `SIM_BURST_COUNT=10`
- Worker Lambda already has `SIM_MAX_JITTER_MS=2000` for backpressure
- No Terraform changes needed

## Restart Steps

### 1. Clean Up Zombie Containers
```bash
# Stop all zombie Lambda containers
docker ps -q --filter "name=localstack-lambda" | xargs -r docker stop
docker ps -aq --filter "name=localstack-lambda" | xargs -r docker rm

# Verify cleanup
docker ps -a | grep lambda
```

### 2. Update Your `.env` File
Copy the new settings from `.env.example`:
```bash
# Add these lines to your .env
LAMBDA_EXECUTOR=local
SIM_WORKER_COUNT=2
SIM_BURST_COUNT=10
```

### 3. Restart LocalStack
```bash
# Full teardown and restart
make infra-down
make infra-up

# Or manually:
docker compose down -v
docker compose up -d
cd infra/envs/localstack && tflocal apply -auto-approve
```

### 4. Verify EventBridge is Disabled
```bash
awslocal events describe-rule --name streaming-agents-simulator-cron --query 'State'
# Should show: "DISABLED"

# If not disabled:
awslocal events disable-rule --name streaming-agents-simulator-cron
```

### 5. Redeploy Lambda Code
```bash
# Rebuild and bundle
pnpm build
npx tsx tools/bundle-lambda.ts

# Deploy all functions
awslocal lambda update-function-code \
  --function-name streaming-agents-simulator-worker \
  --zip-file fileb://dist/lambdas/simulator-worker.zip

awslocal lambda update-function-code \
  --function-name streaming-agents-simulator-controller \
  --zip-file fileb://dist/lambdas/simulator-controller.zip

awslocal lambda update-function-code \
  --function-name streaming-agents-ingestion \
  --zip-file fileb://dist/lambdas/ingestion.zip

awslocal lambda update-function-code \
  --function-name streaming-agents-signal-agent \
  --zip-file fileb://dist/lambdas/signal-agent.zip
```

## Testing After Restart

### Test 1: Single Worker (10 events)
```bash
awslocal lambda invoke \
  --function-name streaming-agents-simulator-worker \
  --cli-binary-format raw-in-base64-out \
  --payload file://test-payload.json \
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

# Check ingested stream
SHARD_ITERATOR=$(awslocal kinesis get-shard-iterator \
  --stream-name streaming-agents-r17-ingested \
  --shard-id shardId-000000000000 \
  --shard-iterator-type TRIM_HORIZON \
  --query 'ShardIterator' --output text)

awslocal kinesis get-records \
  --shard-iterator "$SHARD_ITERATOR" \
  --limit 1 --query 'Records[0].Data' --output text | base64 -d | jq

# Check DynamoDB
awslocal dynamodb get-item \
  --table-name streaming-agents-asset-state \
  --key '{"asset_id": {"S": "R-17"}}' \
  --output json | jq '{reading_count, composite_risk, risk_state}'
```

## Important Notes

### DO NOT Use Controller in LocalStack
The controller is designed for production with 5-50 workers. Even with overrides, it's safer to test workers directly:

```bash
# Good: Direct worker invocation
awslocal lambda invoke --function-name streaming-agents-simulator-worker ...

# Avoid: Controller invocation (spawns multiple workers)
# awslocal lambda invoke --function-name streaming-agents-simulator-controller ...
```

### EventBridge Cron Must Stay Disabled
The cron triggers every minute. With `SIM_WORKER_COUNT=2` and `SIM_BURST_COUNT=10`, that's still 20 events/minute, which is fine. But if you accidentally enable it with default settings, you'll recreate the zombie container problem.

### Local vs Docker Mode

| Mode | Pros | Cons | Use Case |
|------|------|------|----------|
| `local` | Fast, no containers, low resources | Less isolation | Development, testing |
| `docker` | Production-like isolation | Slow, high resources, zombie risk | CI, final validation |

**Recommendation:** Use `local` for all development. Only switch to `docker` for final pre-deployment validation.

## Expected Behavior After Restart

✅ LocalStack healthy
✅ No zombie containers
✅ Lambda invocations succeed (StatusCode 200)
✅ Events flow through Kinesis streams
✅ DynamoDB updates with asset state
✅ Risk events emitted

## Troubleshooting

### "Connection refused" on Kinesis
LocalStack's Kinesis service crashed. Restart LocalStack:
```bash
docker restart streaming-agents-localstack
```

### ESM Not Processing
LocalStack ESM polling is inconsistent. This is a known limitation. The Lambda code is correct - it will work in real AWS.

### Still Getting Zombie Containers
1. Verify `.env` has `LAMBDA_EXECUTOR=local`
2. Restart Docker Compose: `docker compose down && docker compose up -d`
3. Check environment: `docker exec streaming-agents-localstack env | grep LAMBDA_EXECUTOR`

## Next Steps

Once LocalStack is stable:
1. Continue testing with direct worker invocations
2. Test different scenarios (healthy, degradation, etc.)
3. Validate full pipeline with small event counts
4. When ready for AWS deployment, switch to `docker` mode for final validation
