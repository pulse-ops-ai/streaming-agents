# Streaming Agents – Phase 2 Task Execution Plan

This file is the task queue for Claude Code. Execute tasks in order.
Mark tasks complete with ✅ as you finish them.
Read the referenced docs BEFORE starting each task.

---

## Pre-Flight Checklist
Before starting any task, verify:
- [ ] `pnpm build` passes
- [ ] `pnpm generate:jsonschema` runs
- [ ] `ruff check python/` passes
- [ ] Pre-commit hooks pass

---

## Task 2.2 – Architecture Docs & Kiro Agents ✅
**Status:** Complete (created by human + Claude in conversation)
**Output:**
- `docs/ai/context.md` — rehydration anchor
- `docs/ai/services/*.md` — 4 service contracts
- `docs/ai/architecture/*.md` — 4 architecture docs
- `.kiro/agents/*.md` — 4 Kiro review agents

---

## Task 2.3 – Shared Packages
**Read first:** `docs/ai/architecture/lambda-patterns.md` (Package Map section)
**Depends on:** Task 2.2

### 2.3a – `packages/core-contracts/`
Create TypeScript types for all event payloads.
**Read:** `docs/ai/architecture/event-schema-contract.md`

Files to create:
```
packages/core-contracts/
├── src/
│   ├── index.ts                  # Re-exports all types
│   ├── ingested-event.ts         # IngestedEvent type
│   ├── risk-event.ts             # RiskEvent type
│   ├── dlq-message.ts            # DLQMessage type
│   ├── simulator-payload.ts      # SimulatorWorkerPayload type
│   ├── asset-state.ts            # AssetState DynamoDB type
│   └── envelope.ts               # Shared envelope fields
├── package.json                  # @streaming-agents/core-contracts
└── tsconfig.json
```

Acceptance:
- `pnpm build` succeeds for this package
- All types match the schemas in `docs/ai/architecture/event-schema-contract.md`
- Package exports are importable: `import { IngestedEvent } from '@streaming-agents/core-contracts'`

### 2.3b – `packages/core-config/`
Zod-validated environment variable loading.

Files to create:
```
packages/core-config/
├── src/
│   ├── index.ts
│   ├── loader.ts                 # loadConfig<T>(schema: ZodSchema<T>): T
│   ├── schemas/
│   │   ├── lambda.ts             # Base Lambda config schema
│   │   ├── kinesis-consumer.ts   # Kinesis input stream config
│   │   ├── kinesis-producer.ts   # Kinesis output stream config
│   │   └── dynamodb.ts           # DynamoDB table config
│   └── types.ts
├── package.json                  # @streaming-agents/core-config
└── tsconfig.json
```

Acceptance:
- Missing required env vars throw with clear error message
- Zod parse errors include field name and expected type
- Config objects are readonly (frozen)

### 2.3c – `packages/core-telemetry/`
OTel SDK wrapper.
**Read:** `docs/ai/architecture/otel-instrumentation.md`

Files to create:
```
packages/core-telemetry/
├── src/
│   ├── index.ts
│   ├── otel.ts                   # initOtel() SDK setup
│   ├── telemetry.service.ts      # TelemetryService (spans, metrics)
│   ├── logger.service.ts         # LoggerService (structured JSON, pino)
│   └── constants.ts              # LOGGER token, metric names
├── package.json                  # @streaming-agents/core-telemetry
└── tsconfig.json
```

Dependencies: `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`,
`@opentelemetry/exporter-metrics-otlp-http`, `pino`

Acceptance:
- `initOtel('service-name')` creates SDK with OTLP exporters
- `TelemetryService` supports: startSpan, increment, timing, gauge
- `LoggerService` outputs structured JSON with trace correlation
- Works in Lambda environment (batch processor, flush on response)

### 2.3d – `packages/core-kinesis/`
Kinesis producer/consumer wrappers.
**Read:** `docs/ai/architecture/kinesis-topology.md`

Files to create:
```
packages/core-kinesis/
├── src/
│   ├── index.ts
│   ├── producer.ts               # KinesisProducer (PutRecords batching)
│   ├── consumer.ts               # KinesisConsumer (Lambda ESM record parsing)
│   ├── dlq.ts                    # DLQPublisher (SQS)
│   └── types.ts
├── package.json                  # @streaming-agents/core-kinesis
└── tsconfig.json
```

Dependencies: `@aws-sdk/client-kinesis`, `@aws-sdk/client-sqs`

Acceptance:
- Producer batches PutRecords calls (configurable batch size, default 25)
- Consumer deserializes Kinesis event records (base64 decode + JSON parse)
- DLQ publisher formats messages per `DLQMessage` type
- All operations instrumented with OTel spans

### 2.3e – `packages/lambda-base/`
BaseLambdaHandler and NestJS bootstrap.
**Read:** `docs/ai/architecture/lambda-patterns.md`

Files to create:
```
packages/lambda-base/
├── src/
│   ├── index.ts
│   ├── handler.ts                # BaseLambdaHandler<TIn, TOut>
│   ├── bootstrap.ts              # bootstrapLambda() for NestJS context
│   ├── context.ts                # HandlerContext type
│   └── types.ts                  # ProcessResult type
├── package.json                  # @streaming-agents/lambda-base
└── tsconfig.json
```

Dependencies: `@streaming-agents/core-config`, `@streaming-agents/core-telemetry`,
`@nestjs/common`, `@nestjs/core`

Acceptance:
- `BaseLambdaHandler.process()` returns `ProcessResult<TOut>`
- `bootstrapLambda()` creates NestJS context once, reuses on warm invocations
- OTel span wraps every `handle()` call
- DLQ routing works via `onDLQ()` override

---

## Task 2.4 – Infrastructure (Terraform)
**Read first:** `docs/ai/architecture/kinesis-topology.md`
**Depends on:** Task 2.3

Create Terraform resources for LocalStack and AWS sandbox:

```
infra/terraform/
├── main.tf                       # Provider config, backend
├── variables.tf                  # Environment-specific vars
├── kinesis.tf                    # 3 streams
├── sqs.tf                        # 2 DLQ queues
├── dynamodb.tf                   # asset-state table
├── eventbridge.tf                # simulator cron rule
├── lambda.tf                     # 4 Lambda functions + IAM roles
├── outputs.tf                    # Stream ARNs, queue URLs, table name
└── terraform.tfvars.example
```

Acceptance:
- `terraform plan` succeeds against LocalStack
- `terraform apply` creates all resources in LocalStack
- All resource names prefixed with `streaming-agents-`
- IAM roles follow least-privilege

---

## Task 2.5 – Simulator (Controller + Worker)
**Read first:** `docs/ai/services/simulator-controller.md`, `docs/ai/services/simulator-worker.md`
**Depends on:** Task 2.3, Task 2.4

### 2.5a – Simulator Controller Lambda
```
apps/lambdas/simulator-controller/
├── src/
│   ├── main.ts
│   ├── handler.ts                # Reads schedule, invokes N workers
│   ├── handler.module.ts
│   ├── handler.types.ts
│   └── schedule.ts               # Load schedule config
├── package.json
├── tsconfig.json
└── .env.example
```

### 2.5b – Simulator Worker Lambda
```
apps/lambdas/simulator-worker/
├── src/
│   ├── main.ts
│   ├── handler.ts                # Generates events, writes to Kinesis
│   ├── handler.module.ts
│   ├── handler.types.ts
│   ├── scenarios/
│   │   ├── index.ts              # Scenario registry
│   │   ├── healthy.ts
│   │   ├── joint-degradation.ts
│   │   ├── thermal-runaway.ts
│   │   ├── vibration-anomaly.ts
│   │   └── types.ts              # Scenario interface
│   └── prng.ts                   # Seeded PRNG (seedrandom)
├── package.json
├── tsconfig.json
└── .env.example
```

Acceptance:
- Controller reads UTC hour, determines N, invokes N workers
- Workers generate deterministic events (same seed = same output)
- Events conform to R17TelemetryV2Event schema
- Events appear in LocalStack Kinesis stream
- `joint_3_degradation` scenario shows clear position error increase over 120 ticks

---

## Task 2.6 – Ingestion Service
**Read first:** `docs/ai/services/ingestion-service.md`
**Depends on:** Task 2.4, Task 2.5

```
apps/lambdas/ingestion/
├── src/
│   ├── main.ts
│   ├── handler.ts                # Validates, enriches, fans out
│   ├── handler.module.ts
│   └── handler.types.ts
├── package.json
├── tsconfig.json
└── .env.example
```

Acceptance:
- Kinesis ESM triggers Lambda on new records
- Valid events enriched with event_id, trace_id, ingested_at
- Invalid events go to SQS DLQ with error details
- Enriched events written to `r17-ingested` stream
- OTel root span created for each record

---

## Task 2.7 – Signal Agent
**Read first:** `docs/ai/services/signal-agent.md`
**Depends on:** Task 2.6

```
apps/lambdas/signal-agent/
├── src/
│   ├── main.ts
│   ├── handler.ts                # Risk computation
│   ├── handler.module.ts
│   ├── handler.types.ts
│   ├── baseline.ts               # EMA rolling baseline calculator
│   ├── risk.ts                   # Z-scores + composite risk formula
│   └── adapters/
│       └── dynamodb.adapter.ts   # Asset state read/write
├── package.json
├── tsconfig.json
└── .env.example
```

Acceptance:
- Reads IngestedEvent from `r17-ingested`
- Loads/creates asset state from DynamoDB
- Computes z-scores using EMA rolling baselines
- Applies LOCKED composite risk formula (weights: 0.35, 0.25, 0.15, 0.15, 0.10)
- Writes updated state to DynamoDB
- Emits RiskEvent to `r17-risk-events`
- `joint_3_degradation` scenario drives risk from nominal → elevated → critical
- OTel trace continues from ingestion (same trace_id)

---

## End-to-End Validation

After all tasks complete, validate the full pipeline:

1. Deploy all Terraform to LocalStack
2. Run simulator controller once (manual invoke)
3. Verify events in `r17-telemetry` stream
4. Verify ingestion writes to `r17-ingested` stream
5. Verify signal agent writes to DynamoDB + `r17-risk-events`
6. Run `joint_3_degradation` scenario — verify risk climbs to critical
7. Verify OTel traces show full pipeline span hierarchy
8. Verify DLQ receives malformed events (inject bad record)
