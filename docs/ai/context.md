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

**Phase 3 – Diagnosis & Actions Agents**

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

**Lambda Services (6):**
- `simulator-controller` — EventBridge cron → fan-out N workers per load schedule
- `simulator-worker` — 5 deterministic scenarios (seedrandom PRNG), publishes to r17-telemetry
- `ingestion` — Schema validation, OTel root span, metadata enrichment, fan-out to r17-ingested, DLQ routing
- `signal-agent` — EMA baselines, z-scores, composite risk (LOCKED formula), DynamoDB state, RiskEvent emission
- `diagnosis-agent` — Bedrock-powered root cause analysis, debounce, DiagnosisEvent emission (Phase 3)
- `actions-agent` — Deterministic action rules, incident lifecycle, ActionEvent emission (Phase 3)

**Infrastructure (35 Terraform resources):**
- 5 Kinesis streams (r17-telemetry, r17-ingested, r17-risk-events, r17-diagnosis, r17-actions)
- 4 SQS DLQ queues
- 2 DynamoDB tables (asset-state, incidents with GSI)
- 1 EventBridge rule (simulator-cron)
- 6 Lambda functions + IAM roles + ESM mappings
- Lambda bundler: `tools/bundle-lambda.ts` (esbuild, 6 functions)

**Test Coverage:** 288 unit tests passing (across 13 packages)
**E2E Validated:** Phase 2 pipeline on LocalStack — simulator → ingestion → signal-agent → DynamoDB + risk events

---

## Active Phase

### Phase 3 – Diagnosis & Actions Agents
**Goal:** When risk is elevated/critical, explain WHY and recommend WHAT to do.

**Task 3.1 — Service Contracts & Architecture Docs** ✅
- `docs/ai/services/diagnosis-agent.md` — service contract
- `docs/ai/services/actions-agent.md` — service contract
- `docs/ai/architecture/event-schema-contract.md` — DiagnosisEvent, ActionEvent, IncidentRecord added
- `docs/ai/architecture/kinesis-topology.md` — r17-diagnosis, r17-actions streams, incidents table, Terraform HCL
- `docs/ai/architecture/otel-instrumentation.md` — diagnosis-agent + actions-agent spans, attributes, metrics

**Task 3.2 — Core Contracts & Config Schemas** ✅
- `packages/core-config/src/schemas/bedrock.ts` — Bedrock config (model ID, max tokens, temperature, region, debounce)
- `packages/core-config/src/schemas/incidents.ts` — Incidents config (table name, escalation threshold, resolved TTL)
- `packages/core-contracts/src/__tests__/contracts.test.ts` — 9 contract type tests
- `packages/core-config/src/__tests__/schemas.test.ts` — 17 schema validation tests

**Task 3.3 — Diagnosis Agent Lambda** ✅
- `apps/lambdas/diagnosis-agent/` — Full Lambda service (42 tests)
- Pure functions: `buildDiagnosisPrompt`, `parseDiagnosisResponse` (Zod-validated LLM output)
- `BedrockAdapter` — injectable adapter wrapping `InvokeModelCommand` (Anthropic Messages API)
- `MockBedrockAdapter` — deterministic responses for local dev (`NODE_ENV=local`)
- `AssetStateRepository` — debounce check via `last_diagnosis_at` in DynamoDB
- Handler pipeline: skip nominal → debounce → prompt → Bedrock → parse → emit DiagnosisEvent

**Task 3.4 — Actions Agent Lambda** ✅
- `apps/lambdas/actions-agent/` — Full Lambda service (43 tests)
- `evaluateActionRules` — 7 deterministic rules (severity × incident state matrix, NO LLM)
- `buildIncidentRecord` — create/update/resolve with severity upgrade (never downgrade)
- `IncidentAdapter` — DynamoDB with GSI (`asset_id-status-index`) for active incident lookup
- Handler pipeline: load incident → evaluate rules → write incident → emit ActionEvent

**Task 3.5 — Terraform & Bundling** ✅
- `tools/bundle-lambda.ts` — updated to include diagnosis-agent and actions-agent (6 total)
- All Phase 3 Terraform resources defined (2 streams, 1 table, 2 DLQs, 2 Lambdas + IAM + ESM)

**Task 3.6 — E2E Phase 3 Validation** 🔄 IN PROGRESS
- MockBedrockAdapter created and wired (conditional on `NODE_ENV=local` or `localstack`)
- `docker-compose.yml` updated: `LAMBDA_EXECUTOR=docker-reuse` for stable container reuse
- Pending: deploy to LocalStack, run nominal/degradation/resolution/DLQ validation

Two new Lambda services:

1. **Diagnosis Agent** — Kinesis ESM on `r17-risk-events`. Skips nominal risk. Debounce 30s per asset. Calls Bedrock (Claude Sonnet) with structured prompt. Emits `DiagnosisEvent` to `r17-diagnosis`. Zod-validated LLM response.
2. **Actions Agent** — Kinesis ESM on `r17-diagnosis`. Deterministic action rules (NO LLM). Incident lifecycle in DynamoDB (`streaming-agents-incidents`). Emits `ActionEvent` to `r17-actions`.

### Phase 4 – Conversation Agent
**Goal:** Voice-driven AI copilot interface using Amazon Bedrock, Lex, and Polly.

### Phase 5 – Demo, Article, Deployment
**Goal:** Demo video, architecture screenshots, article finalization, deploy to real AWS.

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
│       └── actions-agent/         # ✅ Deterministic rules + incident lifecycle
├── python/
│   ├── packages/
│   │   └── streaming_agents_core/ # ✅ Pydantic models
│   └── services/
│       └── reachy-exporter/       # ✅ Scaffolded (runs on RPi)
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
