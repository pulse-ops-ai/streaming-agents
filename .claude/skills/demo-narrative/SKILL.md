---
name: demo-narrative
description: Define, validate, and rehearse the deterministic 3-minute demo flow for the robotics uptime copilot. Use when planning the demo script, before a live presentation, or when updating demo assets.
---

# Skill 07 — Demo Narrative

## Purpose

Define, validate, and rehearse the deterministic demo flow so that it runs reliably in under 3 minutes and tells the robotics uptime story end-to-end.

## When to Use

- When planning the demo script.
- After completing Phase 2+ (streaming pipeline is functional).
- Before any live presentation or recording.
- When updating `docs/00-overview/demo-script.md`.

## Inputs

| Input | Source |
|-------|--------|
| Demo script | `docs/00-overview/demo-script.md` |
| Agent architecture | `docs/01-architecture/agents.md` |
| Telemetry model | `docs/ai/context.md` — Telemetry Model |
| Risk model | `docs/ai/context.md` — Composite Risk Model |
| Failure scenario | `docs/ai/context.md` — gradual gear wear in Joint 3 |
| Demo assets | `docs/07-article/demo-assets.md` |

## Preconditions

- Phase 2 minimum: streaming pipeline and Signal Agent operational.
- Phase 3 for full incident flow.
- Phase 4 for conversational queries.
- LocalStack running with Terraform applied.

## Steps

### 1. Define the narrative arc

```
[00:00] Start — Dashboard shows R-17 in healthy state
[00:15] Trigger — Activate degradation injection toggle
[00:30] Drift — Telemetry shows torque increasing, temperature rising
[01:00] Detection — Signal Agent computes rising composite risk score
[01:15] Threshold — Risk crosses threshold
[01:30] Incident — Actions Agent creates incident with reasoning capsule
[01:45] Query — Operator asks: "What is failing?"
[02:00] Response — Copilot returns structured explanation
[02:15] Follow-up — "Why?" / "What should we do next?"
[02:30] Resolution — Recommended actions displayed
[02:45] Wrap — Summary of what happened, proactive intelligence
```

### 2. Validate determinism

The demo must produce the same results every time:

- Degradation curve is pre-defined, not random.
- Risk threshold crossing happens at a predictable time.
- Incident creation is deterministic given the same inputs.
- Reasoning capsule content is deterministic.
- Only the LLM narration may vary slightly (acceptable).

### 3. Pre-flight checklist

```bash
# Verify LocalStack is running
localstack status services

# Verify Terraform resources exist
cd infra/envs/localstack && tflocal output && cd ../../..

# Verify services are running
pnpm dev  # or check individual service health

# Verify dashboard is accessible
curl -s http://localhost:3000 > /dev/null && echo "Dashboard OK"

# Verify telemetry simulator is ready
# (Phase 2+ — service-specific health check)
```

### 4. Record demo assets

- Screenshots at each narrative beat.
- Screen recording of full 3-minute flow.
- Store in `docs/07-article/demo-assets.md` (references) and asset storage.

## Outputs

| Artifact | Location |
|----------|----------|
| Demo script | `docs/00-overview/demo-script.md` |
| Demo assets log | `docs/07-article/demo-assets.md` |
| Screenshots/recordings | Project asset storage (gitignored if large) |

## Definition of Done

- Demo script covers all narrative beats.
- Flow completes in under 3 minutes.
- Degradation → detection → incident → explanation flow is deterministic.
- Operator questions produce structured, accurate responses.
- Demo has been rehearsed at least once end-to-end.

## The Three Operator Questions

The demo highlights these three conversational queries:

1. **"What is failing?"** — Returns summary + affected asset + risk score.
2. **"Why?"** — Returns reasoning capsule with contributing signals, deviations, confidence.
3. **"What should we do next?"** — Returns recommended actions based on incident context.

Each response must follow the structured format:

```json
{
  "summary": "...",
  "details": "...",
  "evidence": [...],
  "recommended_actions": [...],
  "confidence": 0.0-1.0
}
```

## Failure Modes & Fixes

| Failure | Fix |
|---------|-----|
| Demo takes > 3 minutes | Shorten degradation ramp; pre-seed baseline data |
| Risk never crosses threshold | Verify degradation curve parameters and threshold value |
| Incident not created | Check Actions Agent cooldown window; may need reset |
| Copilot response is empty | Verify reasoning capsule exists before querying Conversation Agent |
| Dashboard not loading | Check `web/dashboard` dev server; verify port 3000 |
| Non-deterministic results | Ensure simulator uses fixed seed; remove random jitter |

## Phase Discipline

- Phase 1: Script the narrative arc only. No running demo.
- Phase 2: Validate telemetry → risk flow.
- Phase 3: Validate full incident creation.
- Phase 4: Validate conversational queries.
- Phase 5: Full rehearsal and recording.
