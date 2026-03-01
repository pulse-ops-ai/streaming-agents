---
name: repo-toolchain
description: Bootstrap pnpm workspaces, uv Python workspace, Biome linter, Ruff formatter, and TypeScript config from scratch. Use when initializing the streaming-agents monorepo toolchain, onboarding a new contributor, or after a major toolchain upgrade.
---

# Skill 01 — Repo Toolchain Bootstrap

## Purpose

Set up the full monorepo toolchain from scratch so that pnpm, uv, Biome, Ruff, and TypeScript compile cleanly. This is the foundation that every other skill depends on.

## When to Use

- First-time clone of the repository.
- After a major toolchain upgrade (Node, pnpm, Python, uv).
- When onboarding a new contributor or CI runner.

## Inputs

| Input | Source |
|-------|--------|
| Node version | `engines.node` in `package.json` (>=22) |
| pnpm version | `packageManager` in `package.json` (pnpm@9.15.4) |
| Python version | `.python-version` (3.12) |
| uv workspace | `python/pyproject.toml` `[tool.uv.workspace]` |
| pnpm workspace | `pnpm-workspace.yaml` |

## Preconditions

- Node >= 20 installed.
- pnpm >= 9 installed (or `corepack enable`).
- Python >= 3.12 installed.
- `uv` installed (`pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`).
- Docker available (needed later for LocalStack but not this skill).

## Steps

```bash
# 1. Install JS/TS dependencies
pnpm install

# 2. Verify pnpm workspace resolution
pnpm ls -r --depth 0

# 3. Verify Biome is available
pnpm biome --version

# 4. Verify TypeScript compiles (base config)
pnpm exec tsc --showConfig -p tsconfig.base.json

# 5. Install Python dependencies
cd python && uv sync && cd ..

# 6. Verify Ruff is available
cd python && uv run ruff --version && cd ..

# 7. Verify Ruff lints cleanly
cd python && uv run ruff check . && cd ..

# 8. Run Biome check across the repo
pnpm check
```

## Outputs

| Artifact | Location |
|----------|----------|
| JS/TS node_modules | `node_modules/`, `packages/*/node_modules/` |
| Python virtualenv | `python/.venv/` |
| Lock files | `pnpm-lock.yaml`, `python/uv.lock` |

## Definition of Done

- `pnpm ls -r --depth 0` resolves all workspace packages without errors.
- `pnpm check` exits 0.
- `cd python && uv run ruff check .` exits 0.
- `pnpm exec tsc --showConfig -p tsconfig.base.json` produces valid config output.

## Failure Modes & Fixes

| Failure | Fix |
|---------|-----|
| `ERR_PNPM_NO_MATCHING_VERSION` | Run `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| `uv: command not found` | Install uv: `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Biome binary not found | `pnpm install` again — `@biomejs/biome` is a devDependency |
| Python version mismatch | Install Python 3.12 via pyenv or system package manager |
| Workspace member not found | Verify `pnpm-workspace.yaml` globs match directory structure |
| Ruff import errors | Run `cd python && uv sync --reinstall` |

## Phase Discipline

This skill is Phase 1 only. Do not add runtime service code during bootstrap.
