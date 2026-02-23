# Streaming Agents – Task Execution Plan

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

# Phase 2 – Streaming Telemetry Pipeline ✅

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

## Task 2.4 – Infrastructure (Terraform) ✅
**Read first:** `docs/ai/architecture/kinesis-topology.md`
**Depends on:** Task 2.3
**Status:** Complete. All Terraform resources deployed to LocalStack:
- 3 Kinesis streams (r17-telemetry, r17-ingested, r17-risk-events) with 2/2/1 shards, 24hr retention
- 2 SQS DLQ queues (r17-telemetry-dlq, r17-ingested-dlq) with 14-day retention
- 1 DynamoDB table (asset-state) with PAY_PER_REQUEST, hash key asset_id, TTL on expires_at
- 1 EventBridge rule (simulator-cron) at rate(1 minute), targets simulator-controller
- 4 Lambda functions with placeholder code (256MB, correct timeouts: 30s/90s/60s/60s)
- 4 IAM roles with least-privilege policies (kinesis read/write, dynamodb ops, lambda invoke, sqs send)
- 2 Kinesis Event Source Mappings (ingestion←r17-telemetry, signal-agent←r17-ingested) with batch_size=100, parallelization_factor=10, bisect_on_error=true, max_retry=3
- EventBridge target + Lambda permission for simulator-controller invocation
- All outputs defined (stream ARNs, queue URLs, table name, Lambda ARNs, ESM UUIDs)
- All resource names prefixed with `streaming-agents-`
- `tflocal plan` and `tflocal apply` successful, 23 resources created

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

## End-to-End Validation ✅

**Status:** Complete. Full pipeline validated on LocalStack. 105 unit tests passing. All 4 Lambdas bundled, deployed, and invoked successfully. Pipeline: simulator → r17-telemetry → ingestion → r17-ingested → signal-agent → DynamoDB + r17-risk-events. Trace propagation confirmed. Risk state transitions confirmed (joint_3_degradation → elevated/critical, healthy → nominal). LocalStack ESM auto-polling inconsistent (known limitation), manual triggers work correctly.

---

# Phase 3 – Diagnosis & Actions Agents

## Task 3.1 – Service Contracts & Architecture Docs ✅
**Depends on:** Phase 2 complete
**Status:** Complete. All service contracts and architecture docs created/updated:
- `docs/ai/services/diagnosis-agent.md` — service contract with Bedrock prompt template, debounce logic, Zod response parsing, skip/DLQ conditions
- `docs/ai/services/actions-agent.md` — service contract with deterministic action rules matrix (severity × incident state), incident lifecycle (opened/escalated/resolved), DynamoDB incidents table schema with GSI
- `docs/ai/architecture/event-schema-contract.md` — added DiagnosisEvent (#5), ActionEvent (#6), IncidentRecord (#7), updated partition key table
- `docs/ai/architecture/kinesis-topology.md` — added r17-diagnosis, r17-actions streams, r17-diagnosis-dlq, incidents DynamoDB table, updated data flow diagram, added Terraform HCL for all Phase 3 resources including Bedrock IAM
- `docs/ai/architecture/otel-instrumentation.md` — added 10 new spans, 7 new attributes, 8 new metrics for diagnosis-agent and actions-agent
- `docs/ai/context.md` — updated for Phase 3 progress

## Task 3.2 – Core Contracts Update
**Read first:** Updated event-schema-contract.md from 3.1
**Depends on:** Task 3.1

Add new types to `packages/core-contracts/`:
- `DiagnosisEvent` — Bedrock explanation output (asset_id, risk context, root cause analysis, confidence, recommended actions)
- `ActionEvent` — recommended action (alert, throttle, shutdown, acknowledge) with severity and target
- `IncidentRecord` — DynamoDB document for active incidents (opened/escalated/resolved lifecycle)

## Task 3.3 – Infrastructure Update
**Depends on:** Task 3.1

Add Terraform resources:
- Kinesis stream: `r17-diagnosis` (1 shard)
- Kinesis stream: `r17-actions` (1 shard)
- SQS DLQ: `r17-diagnosis-dlq`
- DynamoDB table: `streaming-agents-incidents` (hash: incident_id, GSI: asset_id + status)
- Lambda functions: `diagnosis-agent`, `actions-agent`
- IAM roles with Bedrock invoke permission for diagnosis-agent
- Kinesis ESM: diagnosis-agent ← r17-risk-events, actions-agent ← r17-diagnosis

## Task 3.4 – Diagnosis Agent Lambda
**Read first:** `docs/ai/services/diagnosis-agent.md`
**Depends on:** Task 3.2, Task 3.3

```
apps/lambdas/diagnosis-agent/
```

Extends `BaseLambdaHandler<KinesisStreamEvent, void>`.

Consumes `RiskEvent` from `r17-risk-events`. When risk is `elevated` or `critical`:
1. Load asset state from DynamoDB (baselines, history, last values)
2. Build a structured prompt with risk context:
   - Current z-scores and which signals are contributing
   - Signal trends (last N values from baselines)
   - Scenario context (what the robot is, what the signals mean)
   - Threshold breach details
3. Call Amazon Bedrock (Claude Sonnet) via `@aws-sdk/client-bedrock-runtime`
4. Parse response into structured `DiagnosisEvent`:
   - `root_cause`: concise explanation of likely failure mode
   - `evidence`: array of signal-specific observations
   - `confidence`: low/medium/high
   - `recommended_actions`: array of suggested actions
   - `severity`: info/warning/critical
5. Emit `DiagnosisEvent` to `r17-diagnosis` stream

When risk is `nominal`, skip (no Bedrock call — save cost).

Key constraints:
- Bedrock prompt is templated, not freeform — LLM receives structured data, returns structured response
- LLM NEVER computes risk scores — it explains scores computed by signal-agent
- Bedrock response parsed with Zod for safety (malformed LLM output → DLQ)
- Rate limiting: max 1 Bedrock call per asset per 30 seconds (debounce in DynamoDB)

## Task 3.5 – Actions Agent Lambda
**Read first:** `docs/ai/services/actions-agent.md`
**Depends on:** Task 3.4

```
apps/lambdas/actions-agent/
```

Extends `BaseLambdaHandler<KinesisStreamEvent, void>`.

Consumes `DiagnosisEvent` from `r17-diagnosis`. Determines appropriate response:
1. Load or create incident record from DynamoDB (`streaming-agents-incidents`)
2. Apply action rules (deterministic, NOT LLM):
   - `severity: info` + no open incident → log only
   - `severity: warning` + no open incident → create incident, emit alert action
   - `severity: warning` + existing incident → escalate if sustained > 60s
   - `severity: critical` → create/escalate incident, emit shutdown recommendation
3. Emit `ActionEvent` to `r17-actions` stream
4. Update incident record (status, timeline, action history)

Key constraints:
- Action rules are deterministic — NO LLM in this agent
- Incident lifecycle: opened → escalated → resolved (resolved when risk returns to nominal)
- Deduplication: don't create duplicate incidents for same asset + same root cause
- Actions are recommendations only — no direct robot control (that's Phase 4 conversation agent's domain)

## Task 3.6 – End-to-End Phase 3 Validation
**Depends on:** Task 3.4, Task 3.5

Full pipeline test on LocalStack:
1. Run `joint_3_degradation` scenario (120 events)
2. Verify signal-agent produces elevated/critical RiskEvents
3. Verify diagnosis-agent calls Bedrock and produces DiagnosisEvents with root cause
4. Verify actions-agent creates incident in DynamoDB and emits ActionEvents
5. Run `healthy` scenario — verify incident resolves, no Bedrock calls for nominal risk
6. Verify trace propagation through all 6 services

Note: Bedrock may need real AWS credentials even in LocalStack. If not available locally, mock the Bedrock client for LocalStack testing and validate real Bedrock calls in aws-sandbox.

---

# Phase 4 – Conversation Agent

## Task 4.1 – Service Contract & Architecture
**Depends on:** Phase 3 complete

Design the voice-driven copilot interface:
- `docs/ai/services/conversation-agent.md` — service contract
- Architecture: Amazon Lex (intent recognition) → Lambda fulfillment → Bedrock (response generation) → Polly (speech synthesis)
- Intent model: "What's wrong with R-17?", "Show me the fleet status", "Why is risk critical?", "What should I do?"

## Task 4.2 – Lex Bot Configuration
**Depends on:** Task 4.1

Create Lex V2 bot with intents:
- `AssetStatus` — "How is {asset_id}?" / "What's the status of {asset_id}?"
- `FleetOverview` — "Show me the fleet" / "Any alerts?"
- `ExplainRisk` — "Why is {asset_id} critical?" / "What's happening with {asset_id}?"
- `RecommendAction` — "What should I do about {asset_id}?"
- `AcknowledgeIncident` — "Acknowledge the alert on {asset_id}"

Terraform for Lex bot, intents, slot types, Lambda fulfillment hook.

## Task 4.3 – Fulfillment Lambda
**Depends on:** Task 4.2

Lambda that handles Lex intent fulfillment:
1. Receives Lex event with resolved intent + slots
2. Queries DynamoDB for asset state, incidents, recent diagnosis
3. Builds context-aware prompt for Bedrock
4. Returns natural language response for Polly to speak
5. Includes SSML markup for emphasis on critical information

## Task 4.4 – Polly Integration & Voice Pipeline
**Depends on:** Task 4.3

Wire Polly for text-to-speech output:
- Neural voice selection (e.g., Matthew or Joanna)
- SSML for emphasis: slow down for critical alerts, normal pace for status
- Audio output via Lex streaming response or pre-generated S3 URLs

## Task 4.5 – End-to-End Voice Demo
**Depends on:** Task 4.4

Full voice loop validation:
1. Text input → Lex → intent resolution → Lambda → DynamoDB/Bedrock → response → Polly → audio
2. Test all 5 intents with real asset data from running pipeline
3. Record demo interactions for article video

---

# Phase 5 – Demo, Article & Deployment

## Task 5.1 – AWS Sandbox Deployment
**Depends on:** Phase 4 complete

Deploy full stack to real AWS using $200 credits:
1. `terraform apply` in aws-sandbox workspace
2. Deploy all Lambda code via CI or manual bundle + update
3. Enable EventBridge cron for simulator
4. Verify full pipeline with real Kinesis ESMs (no LocalStack limitations)
5. Verify Bedrock calls work with real credentials
6. Set up Managed Grafana dashboard for demo

## Task 5.2 – Edge Exporter on Real Robot
**Depends on:** Task 5.1

Complete the Reachy exporter implementation:
1. Finish `python/services/reachy-exporter/` implementation
2. Connect to real AWS Kinesis from RPi
3. Validate real sensor data flows through full pipeline
4. Capture video of R-17 moving while dashboard shows telemetry

## Task 5.3 – Grafana Dashboard
**Depends on:** Task 5.1

Create Amazon Managed Grafana dashboard:
- Fleet overview: all assets with current risk state (color-coded)
- Asset detail: time-series of signals, z-scores, composite risk
- Pipeline health: ingestion rate, DLQ counts, processing latency
- Incident timeline: open/escalated/resolved incidents
- OTel trace viewer: click any event to see full pipeline trace

## Task 5.4 – Demo Video
**Depends on:** Task 5.2, Task 5.3

Record 30–60 second demo video:
1. R-17 robot on desk, physically moving
2. Split screen: robot + Grafana dashboard
3. Trigger degradation scenario while filming
4. Risk climbs from nominal → elevated → critical on dashboard
5. Voice copilot explains what's happening
6. Show OTel trace for a single event through full pipeline

## Task 5.5 – Article Finalization
**Depends on:** Task 5.4

Finalize `builder-center-article.md`:
- Update draft with real screenshots and architecture diagram
- Embed demo video
- Sync risk formula weights to match LOCKED formula
- Add "What I Learned" section with real lessons from building
- Cover image: R-17 photo with dashboard overlay
- Submit to AWS Builder Center by March 13, 2026

## Task 5.6 – Community Engagement
**Depends on:** Task 5.5

Post-submission (March 13–20):
- Share article on LinkedIn, Twitter, dev communities
- Cross-post highlights to r/aws, r/robotics, Hacker News
- Engage with comments and questions on Builder Center
- Target: top 300 most-liked articles by March 20

---

# Milestone Summary

| Phase | Status | Tests | Services |
|-------|--------|-------|----------|
| Phase 1 – Tooling | ✅ Complete | — | — |
| Phase 2 – Pipeline | ✅ Complete | 105 | 4 Lambdas, 5 packages |
| Phase 3 – AI Agents | ⬜ Active | — | 2 Lambdas (diagnosis, actions) |
| Phase 4 – Voice | ⬜ Planned | — | 1 Lambda (fulfillment) + Lex + Polly |
| Phase 5 – Demo | ⬜ Planned | — | Grafana, video, article |

**Deadline:** March 13, 2026 (article submission)
**Buffer:** March 20, 2026 (community voting closes)
