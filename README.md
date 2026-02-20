# Streaming Agents

## Robotics Uptime Intelligence for Embodied AI

Streaming Agents is a real-time predictive reliability copilot for autonomous robotic systems.

As embodied AI systems scale across warehouses, labs, and industrial environments, uptime becomes mission critical. Mechanical degradation does not happen instantly — it emerges gradually through subtle telemetry drift. Streaming Agents detects that drift early, creates explainable incidents, and allows operators to query system state conversationally.

This is not a dashboard.
This is streaming operational intelligence for robotics.

---

# The Operational Problem

Autonomous robotic systems introduce a new reliability challenge:

- Servo torque increases before mechanical failure
- Motor temperature rises gradually under stress
- Joint position error drifts over time
- Traditional monitoring creates alert fatigue
- Root cause analysis is slow and manual

Robotics teams need proactive reliability intelligence — not more alerts.

---

# The System

Streaming Agents is composed of four cooperating agents:

### 1️⃣ Signal Agent
Consumes telemetry streams and computes deterministic composite risk scores.

### 2️⃣ Diagnosis Agent
Generates structured reasoning capsules explaining *why* risk increased.

### 3️⃣ Actions Agent
Creates and manages incidents with cooldown and deduplication logic.

### 4️⃣ Conversation Agent
Provides structured, voice-ready explanations powered by an LLM — without delegating core reasoning to it.

Risk scoring is deterministic.
LLMs enhance explanation — they do not invent reasoning.

---

# Telemetry Model (MVP — Locked)

Prototype Asset: **Robotic Unit R-17** (Reachy-Mini)

Signals:

- `joint_3_torque_nm`
- `joint_3_temperature_c`
- `motor_current_amp`
- `joint_position_error_deg`
- `error_code`

Failure Scenario:

Gradual gear wear in Joint 3 leads to:

- Sustained torque increase
- Rising motor temperature
- Intermittent position error spikes
- Composite risk crossing threshold
- Automated incident creation

---

# Architecture Overview

Telemetry → Kinesis → Signal Agent → DynamoDB
→ Diagnosis Agent → Actions Agent
→ Conversation Agent → Voice Interface

Deployment Modes:

- **LocalStack Mode** (local-first development)
- **AWS Sandbox Mode** (Bedrock + optional Lex/Polly)

The architecture is streaming-first and phase-disciplined.

---

# Demo Narrative

1. Start telemetry stream
2. Inject deterministic degradation
3. Risk score rises past threshold
4. Incident automatically created
5. User asks:
   - “What is failing?”
   - “Why?”
   - “What should we do next?”
6. Copilot responds with structured explanation and confidence score

This entire flow runs in under 3 minutes.

---

# Phase Roadmap

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Architecture Lock | ✅ Complete |
| 1 | Repository & Tooling Foundation | 🔄 In Progress |
| 2 | Streaming Telemetry Pipeline | ⏳ Pending |
| 3 | Incident & Explainability Layer | ⏳ Pending |
| 4 | Conversational Copilot | ⏳ Pending |
| 5 | Demo & Polish | ⏳ Pending |

Detailed execution discipline lives in:

`docs/ai/context.md`

---

# Running Locally

1. Install dependencies
   `pnpm install`

2. Setup Python workspace
   `cd python && uv sync`

3. Start LocalStack

4. Apply Terraform
   `cd infra/envs/localstack && terraform init && terraform apply`

5. Start services
   `pnpm dev`

---

# Guardrails

To preserve architectural integrity:

- Risk scoring must remain deterministic
- LLM must not generate reasoning logic
- No computer vision pipelines
- No robotics autonomy modeling
- Strict phase discipline enforced via `docs/ai/context.md`

---

# Why This Matters

As robotics adoption accelerates, uptime becomes a workforce productivity multiplier.

Streaming Agents demonstrates how streaming analytics, deterministic risk modeling, and conversational AI can transform robotic maintenance from reactive troubleshooting into proactive intelligence.

---

This repository contains both the production architecture and the documentation required to support the AIdeas competition submission.
