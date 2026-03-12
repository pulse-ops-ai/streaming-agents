---
name: precommit-secrets
description: Install, configure, and validate pre-commit hooks and secrets scanning (gitleaks, detect-secrets, Biome, Ruff). Use after toolchain bootstrap or when modifying hook configuration.
---

# Skill 02 — Pre-Commit & Secrets Scanning

## Purpose

Install, configure, and validate pre-commit hooks so that every commit passes hygiene, lint, format, and secrets checks before reaching the remote.

## When to Use

- After running Skill 01 (toolchain bootstrap).
- When modifying `.pre-commit-config.yaml`.
- When updating Biome or Ruff versions.
- When the secrets baseline needs regeneration.

## Inputs

| Input | Source |
|-------|--------|
| Hook config | `.pre-commit-config.yaml` |
| Secrets baseline | `.secrets.baseline` |
| Gitleaks config | `.gitleaks.toml`, `.gitleaksignore` |
| Biome config | `biome.json` |
| Ruff config | `python/pyproject.toml` `[tool.ruff]` |

## Preconditions

- Skill 01 complete (pnpm + uv installed).
- `pre-commit` installed (`pip install pre-commit` or `uv tool install pre-commit`).
- Inside the git repository root.

## Steps

```bash
# 1. Install hooks into .git/hooks
pre-commit install

# 2. Run all hooks against the full repo
pre-commit run --all-files

# 3. If detect-secrets fails with new false positives, audit and update baseline
detect-secrets scan --baseline .secrets.baseline
detect-secrets audit .secrets.baseline

# 4. Verify gitleaks passes independently
gitleaks detect --source . --verbose

# 5. Verify Biome hook works on a staged TS file
echo "// test" > /tmp/test-biome.ts
git add /tmp/test-biome.ts 2>/dev/null || true
pnpm biome check --write /tmp/test-biome.ts

# 6. Verify Ruff hook works on staged Python
cd python && uv run ruff check . && uv run ruff format --check . && cd ..
```

## Outputs

| Artifact | Location |
|----------|----------|
| Git hooks | `.git/hooks/pre-commit` |
| Updated baseline | `.secrets.baseline` (if regenerated) |

## Definition of Done

- `pre-commit run --all-files` exits 0.
- No unaudited secrets in `.secrets.baseline`.
- `gitleaks detect --source .` exits 0.
- Staged TS files pass Biome check.
- Staged Python files pass Ruff check + format.

## Hook Inventory

| Hook | Tool | Scope |
|------|------|-------|
| trailing-whitespace | pre-commit-hooks | All files |
| end-of-file-fixer | pre-commit-hooks | All files |
| check-yaml | pre-commit-hooks | YAML |
| check-json | pre-commit-hooks | JSON |
| check-merge-conflict | pre-commit-hooks | All files |
| detect-secrets | Yelp/detect-secrets | All (excl. locks) |
| gitleaks | gitleaks | All files |
| biome-check | Biome (local) | JS/TS/JSON |
| ruff-check | Ruff via uv (local) | Python |
| ruff-format | Ruff via uv (local) | Python |

## Failure Modes & Fixes

| Failure | Fix |
|---------|-----|
| `pre-commit: command not found` | `pip install pre-commit` or `uv tool install pre-commit` |
| detect-secrets baseline mismatch | `detect-secrets scan --baseline .secrets.baseline` then audit |
| gitleaks false positive | Add pattern to `.gitleaksignore` |
| Biome hook fails on JSON | Ensure `biome.json` `files.ignore` excludes lock files |
| Ruff hook runs from wrong cwd | Hook `entry` must `cd python` first (see `.pre-commit-config.yaml`) |
| Hook hangs on large diff | Ensure `pass_filenames: false` on Ruff hooks (current config is correct) |

## Phase Discipline

This skill is Phase 1 only. Hooks must be green before any service code is written.
