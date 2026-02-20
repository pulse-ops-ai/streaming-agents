# Streaming Agents — Phase Task Breakdown

This document defines atomic, phase-locked tasks for AI-assisted execution.

All tasks must respect `docs/ai/context.md` phase discipline.

No cross-phase leakage is allowed.

---

# Phase 1 — Repository & Tooling Foundation (CURRENT)

## Objective
Establish a stable, reproducible development environment before any streaming logic is implemented.

---

## 1️⃣ Workspace Validation

- [x] Verify pnpm workspace resolution across services and packages
- [x] Verify uv workspace members resolve correctly
- [x] Confirm TypeScript compiles (typescript@5.9.3 added as devDependency; no TS source files yet — expected in Phase 1)
- [x] Confirm Ruff runs across Python workspace
- [x] Confirm build scripts function without runtime logic (build, test, clean, lint, format all exit 0)

---

## 2️⃣ Pre-Commit Enforcement

- [x] Confirm Biome runs on staged TypeScript files
- [x] Confirm Ruff runs on staged Python files
- [x] Confirm detect-secrets blocks new secrets
- [x] Confirm gitleaks passes (via pre-commit hook)
- [x] Confirm hooks run clean on full repo (all 10 hooks pass)

---

## 3️⃣ Terraform Baseline

- [x] Validate `infra/envs/localstack` initializes (tflocal init + validate pass)
- [x] Validate LocalStack provider endpoints (tflocal plan confirms endpoint connectivity)
- [x] Validate aws-sandbox provider config (terraform init + validate pass)
- [x] Add placeholder modules for:
  - DynamoDB
  - Kinesis
  - Lambda
- [x] Confirm local apply + destroy works cleanly (0 resources — modules still stubs, cycle exits 0)

---

## 4️⃣ Documentation Alignment

- [x] README reflects robotics uptime initiative
- [x] context.md reflects strict phase discipline
- [x] roles.md exists and is aligned
- [x] tasks.md exists (this file)
- [x] No outdated references to generic telemetry (fixed: risk-scoring.md, telemetry-model.md, project-brief.md, threat-model-lite.md)

---

## 5️⃣ Skills Library

- [x] Create .claude/skills/ with 7 phase-disciplined skills (01–07)
- [x] Create .claude/skills/README.md index
- [x] Mirror skills to .kiro/skills/ via symlinks
- [x] Run docs-spine-sync skill — all spine files present, cross-references validated
- [x] Run workspace-healthcheck skill — 6 pass, 1 fixed (typescript dep), 3 skip (terraform/gitleaks CLI not installed)

---

⚠ No streaming logic allowed in Phase 1.

---

# Phase 2 — Streaming Telemetry Pipeline

## Objective
Implement deterministic streaming telemetry and composite risk calculation.

---

## 1️⃣ Telemetry Simulator

- [ ] Implement R-17 telemetry generator
- [ ] Implement deterministic degradation toggle
- [ ] Emit events matching locked telemetry schema
- [ ] Ensure reproducible degradation pattern

---

## 2️⃣ Kinesis Stream

- [ ] Provision stream via Terraform module
- [ ] Confirm stream reachable in LocalStack
- [ ] Confirm stream reachable in AWS sandbox

---

## 3️⃣ Signal Agent

- [ ] Implement rolling baseline logic
- [ ] Implement z-score calculation
- [ ] Implement composite risk formula:
  - 0.4 torque anomaly
  - 0.3 temperature drift
  - 0.2 position error deviation
  - 0.1 threshold breach
- [ ] Persist asset state to DynamoDB
- [ ] Emit structured risk update events

---

🚫 No incident logic yet.
🚫 No LLM integration yet.

---

# Phase 3 — Incident & Explainability Layer

## Objective
Create explainable incident lifecycle.

---

## 1️⃣ Diagnosis Agent

- [ ] Identify contributing signals
- [ ] Generate deterministic reasoning capsule
- [ ] Include:
  - baseline values
  - current values
  - deviation magnitude
  - composite risk
  - confidence score
  - recommended action

---

## 2️⃣ Actions Agent

- [ ] Create incident table in DynamoDB
- [ ] Implement dedupe logic
- [ ] Implement cooldown logic
- [ ] Implement severity escalation
- [ ] Ensure reasoning capsule stored with incident

---

🚫 LLM still not involved.

---

# Phase 4 — Conversational Copilot

## Objective
Expose structured conversational interface.

---

## 1️⃣ Conversation Agent

- [ ] Define structured response schema:
  - summary
  - details
  - evidence
  - recommended_actions
  - confidence
- [ ] Implement stub provider (local mode)
- [ ] Integrate Bedrock provider (sandbox mode)
- [ ] Ensure LLM cannot invent contributing signals
- [ ] Enforce structured response contract

---

## 2️⃣ Voice Interface (Optional in Phase 4)

- [ ] Implement web voice integration
OR
- [ ] Integrate Lex/Polly in sandbox

---

# Phase 5 — Demo & Polish

## Objective
Deliver deterministic, compelling demo.

---

- [ ] Add degradation injection toggle
- [ ] Add risk gauge visualization
- [ ] Add incident timeline UI
- [ ] Add robot silhouette highlighting Joint 3
- [ ] Validate demo works in under 3 minutes
- [ ] Align Builder Center article with README
- [ ] Capture screenshots + video

---

# Execution Rules

- Tasks must be completed sequentially by phase.
- No skipping ahead.
- No cross-phase feature leakage.
- All logic must align with deterministic risk philosophy.
- If a feature is not required for demo clarity, defer it.

---

This file acts as the structured execution plan for Kiro task generation.
