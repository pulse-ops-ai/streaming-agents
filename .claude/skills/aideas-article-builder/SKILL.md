---
name: aideas-article-builder
description: Scaffold and maintain the AIdeas Builder Center article draft. Use when starting or updating the competition article, after completing a phase, or before final submission.
---

# Skill 06 — AIdeas Article Builder

## Purpose

Scaffold and maintain the Builder Center article draft (`docs/07-article/builder-center-article.md`) so that it stays aligned with the robotics uptime initiative, the demo narrative, and the actual system implementation.

## When to Use

- When starting or updating the competition article draft.
- After completing a phase (to reflect new capabilities).
- Before final submission to ensure accuracy.

## Inputs

| Input | Source |
|-------|--------|
| Project identity | `docs/ai/context.md` — Project Identity section |
| Agent architecture | `docs/01-architecture/agents.md` |
| Risk model | `docs/02-domain/risk-scoring.md` |
| Telemetry model | `docs/ai/context.md` — Telemetry Model section |
| Demo script | `docs/00-overview/demo-script.md` |
| Cover image notes | `docs/07-article/cover-image-notes.md` |
| Demo assets | `docs/07-article/demo-assets.md` |
| README | `README.md` |

## Preconditions

- Skill 05 (docs spine sync) has been run — documentation is consistent.
- The current phase is accurately reflected in `docs/ai/context.md`.

## Steps

### 1. Verify article skeleton

The article must contain these sections (in order):

```markdown
# Title
## Hook / Opening
## The Problem
## The Architecture
## How It Works (Agent Walkthrough)
## The Demo
## Technical Stack
## What We Learned
## What's Next
```

### 2. Populate from source-of-truth docs

| Article Section | Source Document |
|----------------|----------------|
| Hook / Opening | `docs/ai/context.md` — Project Identity |
| The Problem | `README.md` — The Operational Problem |
| The Architecture | `docs/01-architecture/agents.md` |
| How It Works | `docs/ai/context.md` — Agent Architecture |
| The Demo | `docs/00-overview/demo-script.md` |
| Technical Stack | `package.json`, `python/pyproject.toml`, `infra/` |
| What We Learned | Author-written (not auto-generated) |
| What's Next | `docs/ai/context.md` — Phase Roadmap |

### 3. Enforce article constraints

- Category must be **Workplace Efficiency**.
- Tone: Enterprise-serious + AI-forward.
- Risk scoring described as **deterministic** — never imply LLM generates risk logic.
- Reasoning capsules described as **structured and deterministic** — LLM narrates, not invents.
- Demo described as **under 3 minutes**.
- No mention of computer vision, navigation, or autonomy modeling.

### 4. Cross-check technical accuracy

- Agent names and responsibilities match `docs/01-architecture/agents.md`.
- Telemetry signals match the locked MVP list (5 signals).
- Risk formula weights match `docs/ai/context.md`.
- Deployment modes (LocalStack + AWS sandbox) accurately described.

## Outputs

| Artifact | Location |
|----------|----------|
| Article draft | `docs/07-article/builder-center-article.md` |

## Definition of Done

- Article contains all required sections.
- All technical claims match source-of-truth docs.
- No forbidden topics (CV, navigation, autonomy).
- Tone is consistent.
- Demo narrative aligns with `docs/00-overview/demo-script.md`.

## Failure Modes & Fixes

| Failure | Fix |
|---------|-----|
| Article claims LLM does reasoning | Rewrite to clarify: LLM narrates pre-computed reasoning capsules |
| Signal list doesn't match MVP | Update article to use exact 5-signal list from context.md |
| Demo exceeds 3 minutes | Simplify demo script; remove non-essential steps |
| Architecture diagram outdated | Regenerate from `docs/01-architecture/agents.md` |
| Category wrong | Must be "Workplace Efficiency" per context.md |

## Phase Discipline

The article can be started in any phase but must only describe implemented capabilities. Do not describe Phase 2+ features as complete until they are built and verified.
