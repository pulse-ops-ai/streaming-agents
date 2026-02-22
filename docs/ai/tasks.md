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

## Task 2.3 – Shared Packages ✅
**Read first:** `docs/ai/architecture/lambda-patterns.md` (Package Map section)
**Depends on:** Task 2.2

### 2.3a – `packages/core-contracts/` ✅
Create TypeScript types for all event payloads.
**Read:** `docs/ai/architecture/event-schema-contract.md`
**Status:** Complete. All types created: IngestedEvent, RiskEvent, DLQMessage, SimulatorWorkerPayload, AssetState, common types (RiskState, SourceType, ZScores, LastValues, ScenarioName). `random_walk` added to ScenarioName. `asset_id` relaxed from `z.literal('r-17')` to `z.string().min(1)` for fleet support. Build passes, all exports importable.

### 2.3b – `packages/core-config/` ✅
Zod-validated environment variable loading.
**Status:** Complete. `loadConfig<T>(schema)` loads from `process.env`, throws on missing/invalid vars with clear Zod errors. Schemas: lambda, kinesis-consumer, kinesis-producer, dynamodb, simulator. Config objects frozen. Tests pass.

### 2.3c – `packages/core-telemetry/` ✅
OTel SDK wrapper.
**Read:** `docs/ai/architecture/otel-instrumentation.md`
**Status:** Complete. `initOtel()` creates SDK with OTLP exporters. `TelemetryService` supports startSpan, continueTrace, increment, timing, gauge, flush. `LoggerService` outputs structured JSON. `TelemetryModule` for NestJS DI. 28 tests pass. `Reflect.deleteProperty` used for env cleanup (Biome noDelete rule).

### 2.3d – `packages/core-kinesis/` ✅
Kinesis producer/consumer wrappers.
**Read:** `docs/ai/architecture/kinesis-topology.md`
**Status:** Complete. KinesisProducer with auto-batching (max 500, default 25), partial failure retry (3 attempts, exponential backoff). KinesisConsumer with parseRecords<T>(). DLQPublisher with SQS SendMessageCommand + OTel spans. 18 tests pass (7 producer, 5 consumer, 6 DLQ).

### 2.3e – `packages/lambda-base/` ✅
BaseLambdaHandler and NestJS bootstrap.
**Read:** `docs/ai/architecture/lambda-patterns.md`
**Status:** Complete. BaseLambdaHandler<TIn, TOut> with ProcessResult routing (success/skip/retry/dlq), OTel span wrapping, timing metrics, flush in finally. bootstrapLambda() with cold start NestJS context reuse. buildKinesisContexts() for Kinesis ESM. 21 tests pass (13 handler, 4 bootstrap, 4 kinesis-adapter).

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

## Task 2.5 – Simulator (Controller + Worker) ✅
**Read first:** `docs/ai/services/simulator-controller.md`, `docs/ai/services/simulator-worker.md`
**Depends on:** Task 2.3, Task 2.4

### 2.5a – Simulator Controller Lambda ✅
**Status:** Complete. SimulatorControllerHandler extends BaseLambdaHandler<EventBridgeEvent, SimulatorWorkerPayload[]>. 24-hour UTC load schedule (5–50 workers), overridable via JSON. Scenario assignment with mixed mode distribution (60/15/10/10/5). Fire-and-forget Lambda invocations (InvocationType: 'Event'). Deterministic seeds (`{date}:{asset_id}:{invocationCount}`). 12 tests pass.

### 2.5b – Simulator Worker Lambda ✅
**Status:** Complete. SimulatorWorkerHandler extends BaseLambdaHandler<SimulatorWorkerPayload, ProducerRecord[]>. Seedrandom PRNG with Box-Muller Gaussian noise. 5 scenarios: healthy, joint_3_degradation, thermal_runaway, vibration_anomaly, random_walk. Events validated against R17TelemetryEventV2Schema. 21 tests pass (15 scenarios + 6 handler).

---

## Task 2.6 – Ingestion Service ✅
**Read first:** `docs/ai/services/ingestion-service.md`
**Depends on:** Task 2.4, Task 2.5
**Status:** Complete. IngestionHandler extends BaseLambdaHandler<KinesisStreamEvent, void>. Per-record processing with batch parallelism (Promise.allSettled, configurable chunk size). Flow: base64 decode → JSON parse → Zod validate → OTel span → enrich as IngestedEvent → fan-out to r17-ingested. Source type mapping: simulator→simulated, reachy-*→edge, replay→replay. Error routing: PARSE_FAILED, SCHEMA_INVALID, FANOUT_FAILED → DLQ with error details. Continues processing after individual record failures. 18 tests pass (5 source mapper + 13 handler).

---

## Task 2.7 – Signal Agent ✅
**Read first:** `docs/ai/services/signal-agent.md`
**Depends on:** Task 2.6
**Status:** Complete. SignalAgentHandler extends BaseLambdaHandler<KinesisStreamEvent, void>. Pure computation functions extracted: updateBaselines (EMA), computeZScore, computeThresholdBreach, computeCompositeRisk, determineRiskState, getContributingSignals. LOCKED formula implemented: 0.35×|pos_z| + 0.25×|accel_z| + 0.15×|gyro_z| + 0.15×|temp_z| + 0.10×threshold_breach, normalized /3.0, clamped [0,1]. Risk states: nominal (<0.50), elevated (0.50–0.75), critical (≥0.75). DynamoDB adapter for AssetState read/write. Trace continuation via continueTrace() (NOT new root span). Child spans: dynamodb.read, compute, dynamodb.write, emit. Null signal handling (z-score = 0.0). 54 tests pass (10 baseline + 31 risk + 13 handler).

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
