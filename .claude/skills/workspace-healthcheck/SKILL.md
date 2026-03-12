---
name: workspace-healthcheck
description: Run the full monorepo healthcheck — the Phase 1 gate. Validates all workspaces, tooling, hooks, and infrastructure configs. Use before declaring Phase 1 complete or after any config change.
---

# Skill 04 — Workspace Healthcheck

## Purpose

Run a comprehensive validation of the entire monorepo to confirm that all workspaces, tooling, hooks, and infrastructure configs are healthy. This is the Phase 1 gate check.

## When to Use

- Before declaring Phase 1 complete.
- After any toolchain upgrade or config change.
- As a CI preflight check.
- When onboarding to verify a clean setup.

## Inputs

| Input | Source |
|-------|--------|
| pnpm workspace | `pnpm-workspace.yaml` |
| uv workspace | `python/pyproject.toml` |
| TS config | `tsconfig.base.json` |
| Biome config | `biome.json` |
| Ruff config | `python/pyproject.toml` `[tool.ruff]` |
| Pre-commit config | `.pre-commit-config.yaml` |
| Terraform envs | `infra/envs/localstack/`, `infra/envs/aws-sandbox/` |

## Preconditions

- Skills 01-03 have been executed at least once.
- All tools installed (pnpm, uv, pre-commit, terraform, localstack).

## Steps

```bash
# ── 1. pnpm workspace ────────────────────────────────
pnpm ls -r --depth 0
# Expect: all packages/*, services/*, web/* listed

# ── 2. uv workspace ──────────────────────────────────
cd python && uv sync --dry-run && cd ..
# Expect: exit 0, no unresolved members

# ── 3. TypeScript ─────────────────────────────────────
pnpm exec tsc --showConfig -p tsconfig.base.json > /dev/null
# Expect: exit 0

# ── 4. Biome ──────────────────────────────────────────
pnpm check
# Expect: exit 0

# ── 5. Ruff ───────────────────────────────────────────
cd python && uv run ruff check . && uv run ruff format --check . && cd ..
# Expect: exit 0

# ── 6. Pre-commit ─────────────────────────────────────
pre-commit run --all-files
# Expect: exit 0

# ── 7. Secrets ────────────────────────────────────────
gitleaks detect --source . --no-banner
# Expect: exit 0

# ── 8. Terraform (LocalStack) ─────────────────────────
cd infra/envs/localstack && tflocal validate && cd ../../..
# Expect: exit 0

# ── 9. Terraform (AWS sandbox) ────────────────────────
cd infra/envs/aws-sandbox && terraform validate && cd ../../..
# Expect: exit 0

# ── 10. Directory structure ───────────────────────────
# Verify expected service stubs exist
for dir in services/signal-agent services/conversation-agent \
           services/telemetry-simulator services/admin-api \
           packages/schemas packages/telemetry-sdk \
           web/dashboard web/voice-ui; do
  [ -d "$dir" ] && echo "OK: $dir" || echo "MISSING: $dir"
done

# ── 11. Documentation spine ──────────────────────────
for doc in README.md docs/ai/context.md docs/ai/roles.md docs/ai/tasks.md; do
  [ -f "$doc" ] && echo "OK: $doc" || echo "MISSING: $doc"
done
```

## Outputs

| Artifact | Result |
|----------|--------|
| Console output | Pass/fail per check |

No files are created or modified. This skill is read-only.

## Definition of Done

All 11 checks exit 0. Any failure means Phase 1 is not complete.

## Failure Modes & Fixes

| Failure | Fix |
|---------|-----|
| pnpm workspace member missing | Add directory under `packages/`, `services/`, or `web/` with a `package.json` |
| uv workspace member unresolved | Ensure member has `pyproject.toml` and is listed in `python/pyproject.toml` `[tool.uv.workspace].members` |
| Biome errors | `pnpm check:write` to auto-fix |
| Ruff errors | `cd python && uv run ruff check --fix . && uv run ruff format .` |
| Pre-commit hook fails | Run failing hook individually to diagnose; see Skill 02 |
| Terraform validate fails | `tflocal init` may be needed; see Skill 03 |
| Missing service directory | Create directory with `.gitkeep`; do not add runtime code in Phase 1 |

## Phase Discipline

This skill enforces Phase 1 completion. All checks must pass before Phase 2 work begins. If any streaming, risk, or LLM code exists in the repo, the healthcheck should flag it as out-of-phase.
