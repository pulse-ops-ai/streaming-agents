# LocalStack Development Environment

Local development architecture mirroring AWS services via LocalStack Pro.

## Quick Start

```bash
# Start LocalStack + provision all resources
make infra-up

# Tear down everything (Terraform destroy + container removal)
make infra-down
```

## Architecture Overview

```
EventBridge (1 min cron)
  │
  ▼
┌─────────────────────────┐    async invoke    ┌──────────────────────┐
│  Simulator Controller   │───────────────────▶│  Simulator Worker    │
│  (SIM_WORKER_COUNT      │   × N workers      │  (jitter delay       │
│   workers per tick)     │                    │   → burst_count      │
└─────────────────────────┘                    │     events)          │
                                               └──────────┬───────────┘
                                                          │ PutRecords
                                                          ▼
                                               ┌──────────────────────┐
                                               │  Kinesis:            │
                                               │  r17-telemetry       │
                                               │  (2 shards)          │
                                               └──────────┬───────────┘
                                                          │ ESM (batch 100)
                                                          ▼
                                               ┌──────────────────────┐
                                               │  Ingestion Service   │──▶ SQS DLQ
                                               │  (validate+enrich)   │    r17-telemetry-dlq
                                               └──────────┬───────────┘
                                                          │ PutRecords
                                                          ▼
                                               ┌──────────────────────┐
                                               │  Kinesis:            │
                                               │  r17-ingested        │
                                               │  (2 shards)          │
                                               └──────────┬───────────┘
                                                          │ ESM (batch 100)
                                                          ▼
                                               ┌──────────────────────┐
                                               │  Signal Agent        │──▶ SQS DLQ
                                               │  (EMA + z-score      │    r17-ingested-dlq
                                               │   + risk scoring)    │
                                               └──────────┬───────────┘
                                                  │               │
                                     DynamoDB     │               │ PutRecords
                                     (read/write) ▼               ▼
                              ┌──────────────┐    ┌──────────────────────┐
                              │ asset-state  │    │  Kinesis:            │
                              │ (per-asset   │    │  r17-risk-events     │
                              │  baselines)  │    │  (1 shard)           │
                              └──────────────┘    └──────────────────────┘
```

## Lambda Executor Modes

LocalStack supports two Lambda execution strategies. Set via `LAMBDA_EXECUTOR` in `.env`:

| Mode | Env Value | Behavior | Best For |
|------|-----------|----------|----------|
| **Docker** | `docker` | Each invocation spins up a fresh Docker container | CI, production-like isolation |
| **Local** | `local` | Runs Lambda code in the LocalStack JVM process | Fast iteration, low resource usage |

**Default for local dev: `local`** — prevents the zombie container problem where `docker` mode spawns hundreds of containers under sustained EventBridge load.

```bash
# .env
LAMBDA_EXECUTOR=local    # fast, in-process
LAMBDA_EXECUTOR=docker   # isolated, one container per invocation
```

The value is passed to the LocalStack container via `docker-compose.yml`:

```yaml
environment:
  - LAMBDA_EXECUTOR=${LAMBDA_EXECUTOR:-docker}
```

### Docker Mode Warning

In `docker` mode, each Lambda invocation creates a container. With the default load schedule (5-50 workers per minute), a long-running LocalStack can accumulate hundreds of containers and exhaust the thread pool:

```
AssignmentException: Could not start new environment:
  RuntimeError: can't start new thread
```

**Fix:** Use `local` mode for development, or set `SIM_WORKER_COUNT=2` to limit concurrency.

## Simulator Overrides

The simulator generates synthetic telemetry via a two-stage pipeline: controller dispatches workers, workers generate and publish bursts.

### Environment Variables

| Variable | Default | Set On | Description |
|----------|---------|--------|-------------|
| `SIM_WORKER_COUNT` | _(schedule)_ | Controller | Override the hourly load schedule with a fixed worker count |
| `SIM_BURST_COUNT` | `120` | Controller | Events per worker per invocation (120 = 60s at 2 Hz) |
| `SIM_MAX_JITTER_MS` | `2000` | Worker | Max random delay (ms) before burst starts |
| `DEFAULT_SCENARIO` | `mixed` | Controller | Scenario distribution: `mixed`, `healthy`, `joint_3_degradation`, `thermal_runaway`, `vibration_anomaly`, `random_walk` |
| `LOAD_SCHEDULE_JSON` | _(built-in)_ | Controller | Full JSON schedule override `{"0":5,"1":5,...}` |
| `BATCH_SIZE` | `25` | Worker | Kinesis PutRecords batch size |

### Worker Count

Without `SIM_WORKER_COUNT`, the controller uses an hourly schedule that simulates real-world fleet activity:

| UTC Hours | Workers | Period |
|-----------|---------|--------|
| 0-3, 22-23 | 5 | Night / low activity |
| 4-5, 19-20 | 10-15 | Ramp up / wind down |
| 6-7, 17-18 | 25-35 | Shift transitions |
| 8-16 | 40-50 | Peak operations |

For local development, override to a small fixed count:

```bash
# .env — 2 workers, 10 events each, every minute
SIM_WORKER_COUNT=2
SIM_BURST_COUNT=10
```

This produces **20 events/minute** instead of the default **6,000-12,000 events/minute**.

### Backpressure & Jitter

Each worker waits a random delay (0 to `SIM_MAX_JITTER_MS`) before starting its burst. This:

- Staggers Kinesis PutRecords calls across workers
- Prevents thundering-herd on stream shards
- Mimics real-world arrival patterns where robots don't all report simultaneously

Set `SIM_MAX_JITTER_MS=0` to disable jitter (useful for deterministic testing).

## SQS Buffer Pattern (Dead Letter Queues)

Failed records route to SQS dead letter queues for inspection and replay:

| DLQ | Source | Trigger |
|-----|--------|---------|
| `streaming-agents-r17-telemetry-dlq` | Ingestion Service | Malformed telemetry, validation failure |
| `streaming-agents-r17-ingested-dlq` | Signal Agent | Processing error, DynamoDB failure |

### Configuration

- **Retention:** 14 days
- **Visibility timeout:** 5 minutes
- **Max retry attempts:** 3 (on Kinesis ESM before DLQ routing)
- **Bisect on error:** enabled (retries with smaller batch on failure)

### Inspecting the DLQ

```bash
# Check message count
awslocal sqs get-queue-attributes \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/streaming-agents-r17-telemetry-dlq \
  --attribute-names ApproximateNumberOfMessages

# Read messages (non-destructive peek)
awslocal sqs receive-message \
  --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/streaming-agents-r17-telemetry-dlq \
  --max-number-of-messages 5
```

## DynamoDB

| Table | Hash Key | TTL | Billing |
|-------|----------|-----|---------|
| `streaming-agents-asset-state` | `asset_id` (String) | `expires_at` | PAY_PER_REQUEST |

```bash
# Scan asset state
awslocal dynamodb scan --table-name streaming-agents-asset-state --max-items 5

# Get specific asset
awslocal dynamodb get-item \
  --table-name streaming-agents-asset-state \
  --key '{"asset_id": {"S": "R-1"}}'
```

## Kinesis Streams

| Stream | Shards | Retention | Producer | Consumer |
|--------|--------|-----------|----------|----------|
| `streaming-agents-r17-telemetry` | 2 | 24h | Simulator Worker | Ingestion (ESM) |
| `streaming-agents-r17-ingested` | 2 | 24h | Ingestion | Signal Agent (ESM) |
| `streaming-agents-r17-risk-events` | 1 | 24h | Signal Agent | _(Phase 3)_ |

### Reading from a Stream

```bash
# Get shard iterator
SHARD_IT=$(awslocal kinesis get-shard-iterator \
  --stream-name streaming-agents-r17-risk-events \
  --shard-id shardId-000000000000 \
  --shard-iterator-type LATEST \
  --query ShardIterator --output text)

# Read records
awslocal kinesis get-records --shard-iterator "$SHARD_IT"
```

## Lambda Functions

| Function | Trigger | Timeout | Memory |
|----------|---------|---------|--------|
| `streaming-agents-simulator-controller` | EventBridge (1 min) | 30s | 256 MB |
| `streaming-agents-simulator-worker` | Async invoke | 90s | 256 MB |
| `streaming-agents-ingestion` | Kinesis ESM | 60s | 256 MB |
| `streaming-agents-signal-agent` | Kinesis ESM | 60s | 256 MB |

### Manual Invocation

```bash
# Invoke controller (triggers full pipeline)
awslocal lambda invoke \
  --function-name streaming-agents-simulator-controller \
  --payload '{}' /tmp/controller-out.json && cat /tmp/controller-out.json

# Invoke single worker directly
awslocal lambda invoke \
  --function-name streaming-agents-simulator-worker \
  --payload '{"asset_id":"R-1","scenario":"healthy","seed":"test","burst_count":5}' \
  /tmp/worker-out.json && cat /tmp/worker-out.json

# Check function logs
awslocal logs describe-log-groups
awslocal logs get-log-events \
  --log-group-name /aws/lambda/streaming-agents-signal-agent \
  --log-stream-name $(awslocal logs describe-log-streams \
    --log-group-name /aws/lambda/streaming-agents-signal-agent \
    --query 'logStreams[-1].logStreamName' --output text)
```

## Docker Compose

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack-pro:latest
    ports:
      - "4566:4566"            # Gateway
      - "4510-4559:4510-4559"  # External services
    environment:
      - SERVICES=kinesis,dynamodb,lambda,s3,sqs,iam,events,logs
      - LAMBDA_EXECUTOR=${LAMBDA_EXECUTOR:-docker}
      - PERSISTENCE=1
      - LOCALSTACK_AUTH_TOKEN=${LOCALSTACK_AUTH_TOKEN}
    volumes:
      - ./docker/localstack:/var/lib/localstack
      - /var/run/docker.sock:/var/run/docker.sock
```

**Persistence:** Enabled — resources survive container restarts. Volume at `./docker/localstack`.

## Makefile Targets

| Target | Command | Description |
|--------|---------|-------------|
| `make infra-up` | `docker compose up -d` + `tflocal apply` | Start LocalStack and provision all resources |
| `make infra-down` | `tflocal destroy` + `docker compose down -v` | Tear down resources and remove container + volumes |

## Terraform Layout

```
infra/envs/localstack/
├── providers.tf      # AWS provider → localhost:4566
├── lambda.tf         # 4 Lambda functions + ESM triggers
├── kinesis.tf        # 3 Kinesis streams
├── dynamodb.tf       # asset-state table
├── iam.tf            # Roles and policies
├── eventbridge.tf    # Simulator cron rule
├── sqs.tf            # 2 DLQ queues
└── outputs.tf        # Resource ARNs, names, URLs
```

All resources use the `streaming-agents-` prefix. Provider uses test credentials with validation skipped.

## Troubleshooting

### Zombie Containers (Docker Mode)

**Symptom:** `docker ps` shows 100+ `localstack-lambda-*` containers, Lambda invocations fail with "can't start new thread".

**Cause:** `LAMBDA_EXECUTOR=docker` + EventBridge cron spawning many workers per minute.

**Fix:**
```bash
# Stop all zombie containers
docker ps -q --filter "name=localstack-lambda" | xargs -r docker stop
docker ps -aq --filter "name=localstack-lambda" | xargs -r docker rm

# Restart LocalStack
docker restart streaming-agents-localstack

# Switch to local mode to prevent recurrence
# In .env: LAMBDA_EXECUTOR=local
```

### Kinesis Connection Refused

**Symptom:** `InternalError: Connection refused` on Kinesis operations.

**Cause:** LocalStack's internal Kinesis service crashed, usually from resource exhaustion.

**Fix:** Restart LocalStack and re-apply Terraform:
```bash
make infra-down && make infra-up
```

### LocalStack Unhealthy

**Symptom:** `docker ps` shows `(unhealthy)` status.

**Fix:** Full teardown and restart:
```bash
make infra-down && make infra-up
```

### awslocal Alias

The `awslocal` alias is defined in `~/.zshrc`:

```bash
alias awslocal='AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
  AWS_SESSION_TOKEN=test AWS_DEFAULT_REGION=us-east-1 \
  aws --endpoint-url=http://localhost:4566'
```

## Environment Reference

All `.env` variables relevant to LocalStack:

```bash
# AWS / LocalStack
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
LOCALSTACK_ENDPOINT=http://localhost:4566
LOCALSTACK_AUTH_TOKEN=<your-pro-token>
LOCALSTACK_VOLUME_DIR=./docker/localstack

# Lambda Executor
LAMBDA_EXECUTOR=local          # local | docker

# Simulator Overrides
SIM_WORKER_COUNT=2             # fixed worker count (unset = hourly schedule)
SIM_BURST_COUNT=10             # events per worker (default: 120)

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=debug
```
