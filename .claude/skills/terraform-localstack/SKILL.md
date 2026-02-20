---
name: terraform-localstack
description: Initialize and validate Terraform against LocalStack and AWS sandbox environments. Use when setting up infrastructure, modifying Terraform modules, or verifying the init/validate/plan/destroy cycle.
---

# Skill 03 — Terraform + LocalStack Baseline

## Purpose

Initialize, validate, and apply Terraform infrastructure against LocalStack so that AWS service emulation is available for local development.

## When to Use

- After Skill 01 + 02 are complete.
- When adding or modifying Terraform modules under `infra/modules/`.
- When changing LocalStack or AWS sandbox environment configs.
- Before starting Phase 2 streaming work.

## Inputs

| Input | Source |
|-------|--------|
| LocalStack env | `infra/envs/localstack/main.tf` |
| AWS sandbox env | `infra/envs/aws-sandbox/main.tf`, `providers.tf` |
| Module stubs | `infra/modules/{dynamodb,kinesis,lambda,apigw,iot,s3}/` |
| Env vars | `.env.example` (`AWS_REGION`, `LOCALSTACK_ENDPOINT`) |
| TF vars example | `infra/envs/localstack/terraform.tfvars.example` |

## Preconditions

- Terraform >= 1.5 installed.
- Docker running.
- LocalStack container running (`docker compose up -d` or `localstack start`).
- `tflocal` wrapper installed (`pip install terraform-local`).
- `.env` file created from `.env.example` (or env vars exported).

## Steps

```bash
# 1. Start LocalStack (if not running)
localstack start -d
# OR: docker compose up -d (if docker-compose.yml exists)

# 2. Verify LocalStack is healthy
localstack status services

# 3. Initialize Terraform (LocalStack)
cd infra/envs/localstack
tflocal init

# 4. Validate configuration
tflocal validate

# 5. Plan (should show no resources if modules are still commented out)
tflocal plan

# 6. Apply
tflocal apply -auto-approve

# 7. Verify outputs
tflocal output

# 8. Tear down to confirm clean destroy
tflocal destroy -auto-approve

# 9. Validate AWS sandbox config (plan only, no apply)
cd ../aws-sandbox
terraform init
terraform validate
```

## Outputs

| Artifact | Location |
|----------|----------|
| TF state (local) | `infra/envs/localstack/terraform.tfstate` (gitignored) |
| TF lock | `infra/envs/localstack/.terraform.lock.hcl` |
| LocalStack resources | DynamoDB tables, Kinesis streams (when modules are enabled) |

## Definition of Done

- `tflocal init` exits 0.
- `tflocal validate` exits 0.
- `tflocal apply -auto-approve` exits 0 (even if 0 resources in Phase 1).
- `tflocal destroy -auto-approve` exits 0.
- `terraform validate` exits 0 in `aws-sandbox` env.
- No `.tfstate` files committed to git.

## Module Status (Phase 1)

All modules are placeholder `.gitkeep` stubs. They become active in Phase 2+:

| Module | Phase | Purpose |
|--------|-------|---------|
| `dynamodb` | 2 | Asset state, incidents |
| `kinesis` | 2 | Telemetry stream |
| `lambda` | 2 | Signal Agent, Actions Agent |
| `apigw` | 4 | Conversation API |
| `iot` | 2 (optional) | IoT Core ingestion |
| `s3` | 5 | Artifacts, demo assets |

## Failure Modes & Fixes

| Failure | Fix |
|---------|-----|
| `tflocal: command not found` | `pip install terraform-local` |
| LocalStack not running | `localstack start -d` and wait for healthy status |
| Provider plugin error | Delete `.terraform/` and re-run `tflocal init` |
| Port 4566 in use | Stop conflicting process or change `LOCALSTACK_ENDPOINT` |
| State lock error | `tflocal force-unlock <LOCK_ID>` (local dev only) |
| AWS sandbox creds missing | This skill only validates config; real apply needs AWS creds |

## Phase Discipline

Phase 1: Validate init/validate/plan/destroy cycle only. Do not enable modules or provision real resources until Phase 2.
