# Streaming Agents — AI Execution Context (Robotics Initiative)

This document is the authoritative execution context for AI assistants (Kiro, Claude).

It defines:
- The robotics initiative
- Architectural philosophy
- Phase discipline
- What is allowed in the current build cycle
- What is explicitly forbidden

If there is a conflict between implementation and this file, this file wins.

---

# Project Identity (Locked)

Streaming Agents is a real-time predictive reliability copilot for embodied AI systems.

Primary Use Case:
Robotic uptime intelligence for autonomous systems operating in warehouses,
industrial facilities, or research labs.

Prototype Asset:
Robotic Unit R-17 (Reachy-Mini used as a hardware stand-in).

Category:
Workplace Efficiency

Tone:
Enterprise-serious + AI-forward.

This is not a generic telemetry dashboard.
This is streaming operational intelligence for robotics.

---

# System Philosophy

1. Streaming-first (no batch dependencies)
2. Deterministic risk scoring
3. Explainability independent of LLM
4. Agent-oriented separation of responsibilities
5. Local-first development (Terraform + LocalStack)
6. AWS sandbox for final demo
7. Strict phase discipline

LLM enhances narrative explanation.
LLM does NOT generate core reasoning logic.

---

# Agent Architecture (Locked)

## 1. Signal Agent
- Consumes telemetry stream (Kinesis)
- Maintains rolling baselines per asset
- Computes anomaly score (z-score)
- Computes composite risk score
- Updates asset state in DynamoDB

## 2. Diagnosis Agent
- Triggered when risk increases
- Identifies contributing signals
- Generates deterministic reasoning capsule
- Calculates confidence score

## 3. Actions Agent
- Creates incident records
- Suppresses duplicate incidents
- Applies cooldown logic
- Escalates severity if risk persists

## 4. Conversation Agent
- Retrieves asset state + incidents
- Retrieves reasoning capsules
- Calls Bedrock provider (AWS mode)
- Uses stub provider (local mode)
- Returns structured response:

  {
    summary,
    details,
    evidence,
    recommended_actions,
    confidence
  }

---

# Robotics Telemetry Model (MVP Locked)

Asset: R-17

Signals:

- joint_3_torque_nm
- joint_3_temperature_c
- motor_current_amp
- joint_position_error_deg
- error_code (rare events)

We do NOT process:
- Camera feeds
- Computer vision
- Navigation logic
- Behavior modeling
- Robotics autonomy control loops

This is strictly a reliability intelligence layer.

---

# Composite Risk Model (Conceptual)

Composite Risk =

0.4 * torque_anomaly
+ 0.3 * temperature_drift
+ 0.2 * position_error_deviation
+ 0.1 * threshold_breach

Requirements:
- Deterministic
- Explainable
- Repeatable for demo scenarios

The LLM must never invent contributing signals.
Reasoning capsules must be generated deterministically before LLM narration.

---

# Phase Roadmap (Authoritative)

---

## Phase 0 — Architecture Lock (COMPLETE)

Completed:
- Robotics initiative defined
- Agent model finalized
- Telemetry model locked
- Risk philosophy defined
- Toolchain locked (pnpm + uv + Terraform)

---

## Phase 1 — Repository & Tooling Foundation (COMPLETE)

Objective:
- Clean monorepo structure
- pnpm workspace operational
- uv workspace operational
- Terraform environments defined:
  - localstack
  - aws-sandbox
- Biome + Ruff configured
- pre-commit + secrets scanning enforced
- Documentation aligned with robotics initiative

Not allowed in this phase:
- Streaming logic
- Risk calculation code
- Incident logic
- LLM integration

This phase is infrastructure-only.

---

## Phase 2 — Streaming Telemetry Pipeline

Allowed work:
- Telemetry simulator implementation
- Kinesis stream provisioning
- Signal Agent implementation
- Rolling baseline logic
- Composite risk calculation
- DynamoDB asset state storage

Not allowed:
- Conversational interface
- Voice integration

---

## Phase 3 — Incident & Explainability Layer

Allowed work:
- Diagnosis Agent
- Actions Agent
- Reasoning capsule schema
- Incident deduplication logic
- Cooldown enforcement

LLM must not generate reasoning logic.

---

## Phase 4 — Conversational Copilot

Allowed work:
- Conversation Agent
- Bedrock integration
- Stub LLM provider (local mode)
- Structured response contract
- Optional voice integration

---

## Phase 5 — Demo & Polish

Allowed work:
- Deterministic failure injection toggle
- Risk visualization UI
- Incident timeline
- Robot silhouette highlight (Joint 3)
- Final demo script
- Builder Center article alignment

---

# Deployment Modes

## Local Mode
- Terraform
- LocalStack Ultimate
- Stub LLM provider
- Direct Kinesis publishing allowed

## AWS Sandbox Mode
- AWS IoT Core (optional)
- Kinesis Data Streams
- Lambda
- DynamoDB
- Bedrock
- Optional Lex/Polly

Sandbox must be fully tear-downable.

---

# AI Guardrails

When generating code:

- Respect current phase boundaries
- Preserve deterministic risk logic
- Keep reasoning independent of LLM
- Avoid premature abstraction
- Avoid unnecessary complexity
- Do not introduce CV or robotics autonomy features
- Optimize for demo clarity

If uncertain, default to simplicity.

---

# Current Phase Marker

We are currently in:

> Phase 2 — Streaming Telemetry Pipeline

Phase 1 (Repository & Tooling Foundation) is complete.
Incident logic, LLM integration, and conversational interface must not be implemented until Phase 2 is complete.

---

This file enforces architectural discipline and protects the robotics initiative from drift.
