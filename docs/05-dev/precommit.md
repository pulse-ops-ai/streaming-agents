# Pre-commit Hooks

Local pre-commit pipeline for formatting, linting, and secret scanning.

## Prerequisites

| Tool | Install |
|------|---------|
| **Node ≥ 22** | [nodejs.org](https://nodejs.org) |
| **pnpm ≥ 9** | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Python ≥ 3.12** | system package manager or [python.org](https://python.org) |
| **uv** | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **pre-commit** | `uv tool install pre-commit` (or `pip install pre-commit`) |

## Setup (one-time)

```bash
# 1 — install JS dependencies (includes Biome)
pnpm install

# 2 — install git hooks
pre-commit install

# 3 — verify everything passes
pre-commit run --all-files
```

## What the hooks do

| Hook | Scope | What it does |
|------|-------|-------------|
| `trailing-whitespace` | all | strips trailing spaces |
| `end-of-file-fixer` | all | ensures files end with a newline |
| `check-yaml` | `*.yaml` | validates YAML syntax |
| `check-json` | `*.json` | validates JSON syntax |
| `check-merge-conflict` | all | catches leftover conflict markers |
| `detect-secrets` | all | compares against `.secrets.baseline` |
| `gitleaks` | all | scans for hardcoded secrets/keys |
| `biome-check` | JS/TS/JSON | `biome check --write` (format + lint) |
| `ruff-check` | Python | `ruff check .` via `uv run` in `/python` |
| `ruff-format` | Python | `ruff format .` via `uv run` in `/python` |

## Common commands

```bash
# run all hooks against every file
pre-commit run --all-files

# run a single hook
pre-commit run biome-check --all-files
pre-commit run detect-secrets --all-files

# update hook versions
pre-commit autoupdate

# skip hooks for a one-off commit (use sparingly)
git commit --no-verify -m "wip: quick save"
```

## Updating the secrets baseline

When `detect-secrets` flags a **false positive**, update the baseline:

```bash
# 1 — re-scan and write a fresh baseline
detect-secrets scan --baseline .secrets.baseline

# 2 — audit new entries (mark false positives interactively)
detect-secrets audit .secrets.baseline

# 3 — commit the updated baseline
git add .secrets.baseline
git commit -m "chore: update detect-secrets baseline"
```

> [!CAUTION]
> Never blindly regenerate the baseline. Always audit new entries to avoid
> whitelisting real secrets.

## Biome standalone commands

```bash
pnpm lint              # lint only (read-only)
pnpm format            # format with auto-fix
pnpm check             # format + lint (read-only)
pnpm check:write       # format + lint with auto-fix
pnpm check:changed     # auto-fix only changed files
```
