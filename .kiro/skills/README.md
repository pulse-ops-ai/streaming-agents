# Kiro Skills — Streaming Agents

The canonical skills library lives in `.claude/skills/`.

This directory mirrors the same skills for Kiro workflow compatibility.

## Canonical Location

```
.claude/skills/
├── README.md                  ← Index with 1-line summaries
├── 01-repo-toolchain.md       ← Bootstrap pnpm + uv + Biome + Ruff + TypeScript
├── 02-precommit-secrets.md    ← Pre-commit hooks and secrets scanning
├── 03-terraform-localstack.md ← Terraform + LocalStack baseline
├── 04-workspace-healthcheck.md← Full monorepo healthcheck (Phase 1 gate)
├── 05-docs-spine-sync.md      ← Documentation consistency validation
├── 06-aideas-article-builder.md ← Builder Center article draft
└── 07-demo-narrative.md       ← Deterministic 3-minute demo flow
```

## Usage from Kiro

Reference skills by path when creating tasks or workflows:

```
Read .claude/skills/04-workspace-healthcheck.md and execute the healthcheck steps.
```

Or use the symlinked copies in this directory (identical content).

## Why `.claude/skills/` is Canonical

- Claude Code loads `.claude/` files as project context automatically.
- Single source of truth prevents drift between tools.
- Kiro workflows can reference either path — content is identical.
