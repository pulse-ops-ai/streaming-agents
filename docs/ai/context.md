# Streaming Agents – AI Context Anchor

This document is the canonical **rehydration anchor** for AI tools
(Claude Code, Kiro) and humans.

If an AI session restarts, this file defines:
- where the system is
- what is completed
- what must not be changed
- what phase is active
- what files are safe to modify

This file overrides chat history.

---

## Project Identity

- **Name:** Streaming Agents
- **Repo:** `github.com/pulse-ops-ai/streaming-agents`
- **Purpose:** Real-time predictive maintenance copilot for robotic fleet telemetry
- **Competition:** 10,000 AIdeas (AWS Builder Center) — article due March 13, 2026
- **Hardware:** Reachy Mini ("R-17") — wireless desktop robot, RPi 5, FastAPI daemon

---

## Current Phase

**Phase 5 – Demo, Article & Deployment** (active)

---

## Completed Phases

### Phase 1 – Repository & Tooling Foundation (COMPLETE)
- Monorepo: pnpm (TypeScript) + uv (Python)
- Pre-commit: 10 hooks (Biome, Ruff, detect-secrets, Terraform fmt)
- Terraform: `infra/terraform/` with localstack + aws-sandbox workspaces
- Telemetry v2 Schema:
  - Zod: `packages/schemas/src/telemetry/r17-telemetry-v2.ts`
  - JSON Schema: `packages/schemas/generated/r17-telemetry-v2.schema.json`
  - Pydantic: `python/packages/streaming_agents_core/`
- Reachy Edge Exporter scaffolded: `python/services/reachy-exporter/`
- IMU SDK confirmed working alongside daemon (no conflict)

### Phase 2 – Streaming Telemetry Pipeline (COMPLETE)

**Shared Packages (5):**
- `@streaming-agents/core-contracts` — IngestedEvent, RiskEvent, DiagnosisEvent, ActionEvent, IncidentRecord, DLQMessage, SimulatorWorkerPayload, AssetState
- `@streaming-agents/core-config` — Zod-validated env loading (bedrockConfigSchema, incidentsConfigSchema), Secrets Manager resolution
- `@streaming-agents/core-telemetry` — OTel SDK init, TelemetryService, LoggerService, NestJS module
- `@streaming-agents/core-kinesis` — KinesisProducer (batching, partial retry), KinesisConsumer, DLQPublisher
- `@streaming-agents/lambda-base` — BaseLambdaHandler<TIn,TOut>, bootstrapLambda(), KinesisLambdaAdapter

**Lambda Services (7):**
- `simulator-controller` — EventBridge cron → fan-out N workers per load schedule
- `simulator-worker` — 5 deterministic scenarios (seedrandom PRNG), publishes to r17-telemetry
- `ingestion` — Schema validation, OTel root span, metadata enrichment, fan-out to r17-ingested, DLQ routing
- `signal-agent` — EMA baselines, z-scores, composite risk (LOCKED formula), DynamoDB state, RiskEvent emission
- `diagnosis-agent` — Bedrock-powered root cause analysis, debounce, DiagnosisEvent emission (Phase 3)
- `actions-agent` — Deterministic action rules, incident lifecycle, ActionEvent emission (Phase 3)
- `conversation-agent` — Lex V2 fulfillment, Bedrock-powered responses, SSML output (Phase 4)

**Infrastructure (35+ Terraform resources):**
- 5 Kinesis streams (r17-telemetry, r17-ingested, r17-risk-events, r17-diagnosis, r17-actions)
- 4 SQS DLQ queues
- 2 DynamoDB tables (asset-state, incidents with GSI)
- 1 EventBridge rule (simulator-cron)
- 6 Lambda functions + IAM roles + ESM mappings
- Lambda bundler: `tools/bundle-lambda.ts` (esbuild, 6 functions)

**Test Coverage:** 313 unit tests passing (across 14 packages)
**E2E Validated:** Phase 2 pipeline on LocalStack — simulator → ingestion → signal-agent → DynamoDB + risk events

---

### Phase 3 – Diagnosis & Actions Agents (COMPLETE)
**Goal:** When risk is elevated/critical, explain WHY and recommend WHAT to do.

- Two new Lambda services created: Diagnosis Agent (Bedrock LLM) and Actions Agent (Deterministic Rules)
- Infrastructure deployed: 2 Kinesis streams, 1 DynamoDB table, SQS DLQs, ES Mappings
- Integration tested locally with MockBedrockAdapter
- Service contracts and schemas locked

---

### Phase 4 – Conversation Agent (COMPLETE)
**Goal:** Voice-driven AI copilot interface using Amazon Bedrock, Lex, and Polly.

- Lex V2 bot deployed: 5 intents (AssetStatus, FleetOverview, ExplainRisk, RecommendAction, AcknowledgeIncident)
- conversation-agent Lambda: NestJS DI, intent router, DynamoDB adapters, Bedrock adapter (Claude Sonnet 4.6)
- SSML response builder with speech context (severity-based emphasis, robot ID formatting)
- All 5 intents validated end-to-end on AWS
- Bot ID: DQCBGQZ5XT, Alias ID: AA8WY50QIT

---

## Active Phase

### Phase 5 – Demo, Article & Deployment
**Goal:** Demo video, architecture screenshots, article finalization, real hardware validation.

**Task 5.1 — AWS Sandbox Deployment** ✅
- Full stack deployed to AWS (us-east-1, account 832931621664)
- 7 Lambdas, 5 Kinesis streams, 2 DynamoDB tables, Lex V2, Bedrock
- CI/CD: GitHub Actions (Lambda Build → S3 SHA-keyed → Terraform Deploy)

**Task 5.2a — Edge Exporter on Real Robot** ✅
- `python/services/reachy-exporter/` deployed to RPi5 as systemd service
- Real telemetry flowing through full pipeline (Exporter → Kinesis → Ingestion → Signal Agent → DynamoDB)
- R-17 asset state: nominal, composite_risk 0, 2000+ readings processed
- IMU fields null (SDK not used by exporter, REST API only)

**Task 5.2b — Voice Terminal on Real Robot** 🔄
- `python/services/reachy-voice/` rewritten for Reachy Mini SDK audio (25 tests)
- SDK WebSocket 403 blocking — daemon rejects `/ws/sdk` connections
- Deployed to RPi5 at `~/reachy-voice/`

**Task 5.3 — Grafana Dashboard** ⬜ PENDING

**Task 5.4 — Demo Video** ⬜ PENDING

**Task 5.5 — Article Finalization** ⬜ PENDING

**Task 5.6 — Community Engagement** ⬜ PENDING

---

## Monorepo Structure

```
streaming-agents/
├── .kiro/
│   └── agents/                    # Kiro code review agents (5)
├── packages/
│   ├── schemas/                   # ✅ Zod schemas + JSON Schema generation
│   ├── core-contracts/            # ✅ Event envelope + typed payloads
│   ├── core-config/               # ✅ Zod-validated env config + Secrets Manager
│   ├── core-telemetry/            # ✅ OTel wrapper + NestJS module
│   ├── core-kinesis/              # ✅ Kinesis put/get + DLQ helper
│   └── lambda-base/               # ✅ BaseLambdaHandler<TIn, TOut>
├── apps/
│   └── lambdas/
│       ├── simulator-controller/  # ✅ EventBridge → fan-out
│       ├── simulator-worker/      # ✅ Generate v2 events → Kinesis
│       ├── ingestion/             # ✅ Kinesis trigger → validate → fan-out
│       ├── signal-agent/          # ✅ Risk scoring → DynamoDB
│       ├── diagnosis-agent/       # ✅ Bedrock diagnosis + MockBedrockAdapter
│       ├── actions-agent/         # ✅ Deterministic rules + incident lifecycle
│       └── conversation-agent/    # ✅ Lex fulfillment + Bedrock + SSML
├── python/
│   ├── packages/
│   │   └── streaming_agents_core/ # ✅ Pydantic models (v1 + v2)
│   └── services/
│       ├── reachy-exporter/       # ✅ Deployed to RPi5, 34 tests
│       └── reachy-voice/          # 🔄 SDK audio rewrite, 25 tests
├── contracts/
│   └── kinesis/                   # ⬜ JSON Schema per event type
├── infra/
│   └──                            # ✅ 23 resources deployed to LocalStack
├── tools/
│   ├── bundle-lambda.ts           # ✅ esbuild Lambda bundler
│   └── generators/                # ⬜ Lambda scaffold generator
└── docs/
    ├── ai/                        # Architecture docs for AI tools
    │   ├── context.md             # THIS FILE
    │   ├── tasks.md               # Task execution plan
    │   ├── services/              # Service contracts (4 complete + 2 Phase 3)
    │   └── architecture/          # Cross-cutting architecture docs (4)
    └── 02-domain/                 # ✅ Telemetry model docs
```

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | NestJS on AWS Lambda | TypeScript, BaseLambdaHandler pattern |
| Streaming | Amazon Kinesis Data Streams | 5 streams, partition by asset_id |
| State | Amazon DynamoDB | Asset state + incidents (GSI) tables |
| Scheduling | Amazon EventBridge | Cron trigger for simulator |
| AI (Phase 3) | Amazon Bedrock (Claude) | Diagnosis explanations |
| Voice (Phase 4) | Amazon Lex + Polly | Conversation agent |
| Observability | OpenTelemetry → Managed Prometheus + Grafana | Trace propagation validated |
| Edge | Python on Raspberry Pi 5 | Reachy Mini daemon + IMU SDK |
| IaC | Terraform + LocalStack | 35 resources, esbuild bundling, docker-reuse executor |

## Telemetry v2 Schema (LOCKED — DO NOT MODIFY)

Direct signals: `board_temperature_c`, `control_loop_freq_hz`, `control_loop_error_count`, `control_mode`, `error_code`
Derived signals: `accel_magnitude_ms2`, `gyro_magnitude_rads`, `joint_position_error_deg`
Sampling: 2 Hz per asset

## Composite Risk Formula (LOCKED — DO NOT MODIFY)

```
composite_risk =
  0.35 × abs(position_error_z) +
  0.25 × abs(accel_z) +
  0.15 × abs(gyro_z) +
  0.15 × abs(temperature_z) +
  0.10 × threshold_breach
```
Normalize: `Math.min(composite_risk / 3.0, 1.0)`
Risk states: nominal (< 0.50), elevated (0.50–0.75), critical (≥ 0.75)

## Core Invariants (DO NOT VIOLATE)

- **Kinesis is the backbone** — all telemetry flows through Kinesis streams
- **Schema validation at ingestion** — malformed events go to DLQ, never downstream
- **Risk formula is deterministic** — LLM never computes risk scores
- **OTel traces follow events** — trace_id created at ingestion, propagated through pipeline
- **Lambda-base pattern** — all Lambdas extend `BaseLambdaHandler<TIn, TOut>`
- **Contracts before code** — service contracts in `docs/ai/services/` define boundaries
- **Phase discipline** — do not start Phase N+1 until Phase N is complete
- **LocalStack first** — all Terraform validates against LocalStack before AWS

## Hardware Reference

See `docs/ai/reachy-mini-sdk-reference.md` for complete Reachy Mini API reference.

Key constraints:
- No per-motor torque/current/temperature (Reachy Mini doesn't expose these)
- IMU requires SDK access via `/venvs/mini_daemon/bin/python`
- REST API at `http://reachy-mini.local:8000`
- ~50 Hz control loop, we sample at 2 Hz
