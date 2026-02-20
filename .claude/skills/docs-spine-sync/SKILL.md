---
name: docs-spine-sync
description: Validate documentation completeness, cross-reference consistency, and terminology alignment across the docs tree. Use after modifying any doc, before declaring a phase complete, or when preparing the AIdeas article.
---

# Skill 05 — Documentation Spine Sync

## Purpose

Validate that the documentation tree is complete, internally consistent, and aligned with the robotics uptime initiative defined in `docs/ai/context.md`.

## When to Use

- After modifying any doc under `docs/`.
- After updating `README.md`.
- Before declaring a phase complete.
- When preparing the AIdeas article (pairs with Skill 06).

## Inputs

| Input | Source |
|-------|--------|
| Execution context | `docs/ai/context.md` |
| Roles | `docs/ai/roles.md` |
| Tasks | `docs/ai/tasks.md` |
| README | `README.md` |

## Preconditions

- Repository cloned and accessible.
- No tooling required — this is a documentation-only skill.

## Steps

### 1. Verify documentation spine exists

Every section must have at least a stub file:

```
docs/
├── 00-overview/
│   ├── mvp-scope.md
│   └── demo-script.md
├── 01-architecture/
│   ├── agents.md
│   ├── aws-architecture.md
│   ├── localstack-architecture.md
│   └── system-context.md
├── 02-domain/
│   ├── risk-scoring.md
│   ├── telemetry-model.md
│   ├── incidents.md
│   ├── evidence-and-explainability.md
│   └── reasoning-capsule.md
├── 03-apis/
│   ├── conversation-api.md
│   ├── admin-api.md
│   └── sse-and-streaming.md
├── 04-infra/
│   ├── terraform-layout.md
│   ├── localstack.md
│   ├── aws-sandbox.md
│   ├── networking.md
│   └── cost-and-teardown.md
├── 05-dev/
│   ├── getting-started.md
│   ├── local-dev.md
│   ├── testing.md
│   ├── troubleshooting.md
│   └── observability.md
├── 06-security/
│   ├── iam-notes.md
│   ├── secrets-management.md
│   └── threat-model-lite.md
├── 07-article/
│   ├── builder-center-article.md
│   ├── cover-image-notes.md
│   └── demo-assets.md
└── ai/
    ├── context.md
    ├── roles.md
    └── tasks.md
```

### 2. Cross-reference consistency checks

- README.md agent list matches `docs/01-architecture/agents.md`.
- README.md telemetry signals match `docs/ai/context.md` signal list.
- README.md phase table matches `docs/ai/context.md` phase roadmap.
- `docs/ai/roles.md` roles cover all four agents.
- `docs/ai/tasks.md` tasks align with phase roadmap.
- Risk formula in `docs/02-domain/risk-scoring.md` matches `docs/ai/context.md`.

### 3. Terminology audit

Verify consistent use of:

| Term | Correct | Incorrect |
|------|---------|-----------|
| Project name | Streaming Agents | StreamingAgents, streaming-agents (in prose) |
| Asset | R-17 (Reachy-Mini) | robot-17, Unit 17 |
| Risk model | Composite risk score | risk index, danger score |
| Explanation | Reasoning capsule | explanation blob, rationale |
| Category | Workplace Efficiency | Productivity, Operations |

### 4. Phase marker validation

- `docs/ai/context.md` declares current phase.
- `README.md` phase table matches.
- `docs/ai/tasks.md` marks correct phase as CURRENT.

## Outputs

| Artifact | Result |
|----------|--------|
| Console report | List of missing files, inconsistencies, or term violations |

This skill modifies files only when fixing identified inconsistencies.

## Definition of Done

- All spine files exist (stubs acceptable).
- No cross-reference contradictions between README, context.md, roles.md, and tasks.md.
- Terminology is consistent across all docs.
- Phase markers agree.

## Failure Modes & Fixes

| Failure | Fix |
|---------|-----|
| Missing spine file | Create stub with `# Title` and one-line description |
| Phase mismatch | Update the out-of-date file to match `docs/ai/context.md` (source of truth) |
| Term inconsistency | Find-and-replace across `docs/` — `docs/ai/context.md` terminology wins |
| README drift | Regenerate affected README sections from context.md |
| Stale agent description | Align with `docs/01-architecture/agents.md` |

## Phase Discipline

This skill applies to all phases. Documentation must stay synchronized as the project progresses. The `docs/ai/context.md` file is the single source of truth — all other docs defer to it on conflict.
