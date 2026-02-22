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

**Phase 2 – Streaming Telemetry Pipeline**

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
- Documentation: `docs/02-domain/telemetry-model.md`, `docs/rmi/README.md`

---

## Active Phase

### Phase 2 – Streaming Telemetry Pipeline
**Goal:** End-to-end flow: simulated telemetry → Kinesis → ingestion → signal agent → risk score → DynamoDB

#### Architecture (LOCKED)

Five decoupled services, three producers, two consumers:

**Producers** (write to Kinesis `r17-telemetry`):
1. **Edge Exporter** (Python on RPi) — real hardware telemetry at 2 Hz
2. **Simulator Controller** (NestJS Lambda, EventBridge cron) — invokes N worker Lambdas
3. **Simulator Worker** (NestJS Lambda) — generates synthetic fleet telemetry with degradation scenarios

**Consumers** (read from Kinesis):
4. **Ingestion Service** (NestJS Lambda) — schema validation, OTel trace initiation, metadata enrichment, fan-out
5. **Signal Agent** (NestJS Lambda) — rolling baselines, z-scores, composite risk, DynamoDB state

**Observability Stack:**
- OpenTelemetry for traces + metrics
- Amazon Managed Prometheus for metric storage
- Amazon Managed Grafana for dashboards
- SQS as buffer between OTel export and processing

#### Telemetry v2 Schema (LOCKED — DO NOT MODIFY)

Direct signals: `board_temperature_c`, `control_loop_freq_hz`, `control_loop_error_count`, `control_mode`, `error_code`
Derived signals: `accel_magnitude_ms2`, `gyro_magnitude_rads`, `joint_position_error_deg`
Sampling: 2 Hz per asset

#### Composite Risk Formula (LOCKED — DO NOT MODIFY)

```
composite_risk =
  0.35 × position_error_z +
  0.25 × accel_z +
  0.15 × gyro_z +
  0.15 × temperature_z +
  0.10 × threshold_breach
```

Risk states: nominal (< 0.50), elevated (0.50–0.75), critical (≥ 0.75)

#### Tasks

```
2.1  ✅ Telemetry v2 Schema & Reachy Exporter scaffold
2.2  ✅ Architecture docs + Kiro agents
2.3  ✅ Shared packages (core-contracts, core-config, core-telemetry, core-kinesis, lambda-base)
2.4  ✅ Infrastructure (Terraform → LocalStack): Kinesis, SQS, EventBridge, DynamoDB, Lambda roles
2.5  ✅ Simulator (Controller Lambda + Worker Lambda)
2.6  ✅ Ingestion Service (Kinesis trigger → validate → OTel → fan-out)
2.7  ✅ Signal Agent (baselines → z-scores → risk → DynamoDB)
```

---

## Future Phases (DO NOT START)

### Phase 3 – Diagnosis & Actions Agents
### Phase 4 – Conversation Agent (Bedrock + Lex + Polly)
### Phase 5 – Demo UI, Video, Article Finalization

---

## Monorepo Structure

```
streaming-agents/
├── .kiro/
│   └── agents/                    # Kiro code review agents
├── packages/
│   ├── schemas/                   # ✅ Zod schemas + JSON Schema generation
│   ├── core-contracts/            # ⬜ Event envelope + typed payloads
│   ├── core-config/               # ⬜ Zod-validated env config
│   ├── core-telemetry/            # ⬜ OTel wrapper + tag contract
│   ├── core-kinesis/              # ⬜ Kinesis put/get + DLQ helper
│   └── lambda-base/               # ⬜ BaseLambdaHandler<TIn, TOut>
├── apps/
│   └── lambdas/
│       ├── simulator-controller/  # ⬜ EventBridge → fan-out
│       ├── simulator-worker/      # ⬜ Generate v2 events → Kinesis
│       ├── ingestion/             # ⬜ Kinesis trigger → validate → fan-out
│       └── signal-agent/          # ⬜ Risk scoring → DynamoDB
├── python/
│   ├── packages/
│   │   └── streaming_agents_core/ # ✅ Pydantic models
│   └── services/
│       └── reachy-exporter/       # ✅ Scaffolded (runs on RPi)
├── contracts/
│   └── kinesis/                   # ⬜ JSON Schema per event type
├── infra/
│   └──                            # ✅ Scaffolded (localstack + aws-sandbox)
├── tools/
│   └── generators/                # ⬜ Lambda scaffold generator
└── docs/
    ├── ai/                        # Architecture docs for AI tools
    │   ├── context.md             # THIS FILE
    │   ├── services/              # Service contracts
    │   └── architecture/          # Cross-cutting architecture docs
    └── 02-domain/                 # ✅ Telemetry model docs
```

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | NestJS on AWS Lambda | TypeScript, same patterns as Lattice worker-base |
| Streaming | Amazon Kinesis Data Streams | Replaces Kafka from Lattice |
| State | Amazon DynamoDB | Asset state, rolling baselines |
| Scheduling | Amazon EventBridge | Cron trigger for simulator |
| Observability | OpenTelemetry → Managed Prometheus + Grafana | Replaces Datadog from Lattice |
| Edge | Python on Raspberry Pi 5 | Reachy Mini daemon + IMU SDK |
| IaC | Terraform + LocalStack | Continuous deploy to LocalStack during dev |
| AI (Phase 4) | Amazon Bedrock, Lex, Polly | Conversation agent |

## Core Invariants (DO NOT VIOLATE)

- **Kinesis is the backbone** — all telemetry flows through `r17-telemetry` stream
- **Schema validation at ingestion** — malformed events go to DLQ, never downstream
- **Risk formula is deterministic** — LLM never computes risk scores
- **OTel traces follow events** — every event gets a trace ID at ingestion
- **Lambda-base pattern** — all Lambdas extend `BaseLambdaHandler<TIn, TOut>`
- **Contracts before code** — JSON Schema in `contracts/kinesis/` is source of truth
- **Phase discipline** — do not start Phase N+1 until Phase N is complete
- **LocalStack first** — all Terraform validates against LocalStack before AWS

## Hardware Reference

See `docs/ai/reachy-mini-sdk-reference.md` for complete Reachy Mini API reference.

Key constraints:
- No per-motor torque/current/temperature (Reachy Mini doesn't expose these)
- IMU requires SDK access via `/venvs/mini_daemon/bin/python`
- REST API at `http://reachy-mini.local:8000`
- ~50 Hz control loop, we sample at 2 Hz
