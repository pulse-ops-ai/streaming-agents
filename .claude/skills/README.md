# Claude Skills Library — Streaming Agents

Reusable, phase-disciplined skills for the robotics uptime initiative.

Source of truth: `docs/ai/context.md`

## Skills Index

| # | Skill | Purpose |
|---|-------|---------|
| 01 | [repo-toolchain](01-repo-toolchain.md) | Bootstrap pnpm + uv + Biome + Ruff + TypeScript from scratch. |
| 02 | [precommit-secrets](02-precommit-secrets.md) | Install and validate pre-commit hooks and secrets scanning. |
| 03 | [terraform-localstack](03-terraform-localstack.md) | Initialize and validate Terraform against LocalStack and AWS sandbox. |
| 04 | [workspace-healthcheck](04-workspace-healthcheck.md) | Run full monorepo healthcheck — the Phase 1 gate. |
| 05 | [docs-spine-sync](05-docs-spine-sync.md) | Validate documentation completeness and cross-reference consistency. |
| 06 | [aideas-article-builder](06-aideas-article-builder.md) | Scaffold and maintain the Builder Center article draft. |
| 07 | [demo-narrative](07-demo-narrative.md) | Define and validate the deterministic 3-minute demo flow. |

## Execution Order (Phase 1)

```
01 → 02 → 03 → 04 (gate) → 05
```

Skills 06 and 07 can run in parallel once 05 is complete.

## Phase Discipline

All skills enforce the phase boundaries defined in `docs/ai/context.md`. No skill introduces streaming, risk, or LLM implementation code — that begins in Phase 2.
