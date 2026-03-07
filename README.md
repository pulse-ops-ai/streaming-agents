# Streaming Agents

## Robotics Uptime Intelligence for Embodied AI

Streaming Agents is a real-time predictive reliability copilot for autonomous robotic systems. It detects mechanical degradation through telemetry drift, creates explainable incidents, and lets operators query system state conversationally via voice.

**Live on AWS** | 7 Lambda functions | 5 Kinesis streams | Amazon Lex V2 + Bedrock (Claude Sonnet 4.6) | Full CI/CD via GitHub Actions

---

## Architecture

```
Telemetry Source (Simulator / Reachy Mini)
    |
    v
Kinesis: r17-telemetry
    |
    v
Ingestion Lambda ──> Kinesis: r17-ingested
                          |
                          v
                    Signal Agent Lambda ──> DynamoDB: asset-state
                          |                     + Kinesis: r17-risk-events
                          v
                    Diagnosis Agent Lambda (Bedrock) ──> Kinesis: r17-diagnosis
                          |
                          v
                    Actions Agent Lambda ──> DynamoDB: incidents
                          |                     + Kinesis: r17-actions
                          v
                    Lex V2 Bot ──> Conversation Agent Lambda (Bedrock)
                                        |
                                        v
                                   SSML / Polly Voice Output
```

### Agents

| Agent | Role | Backing |
|-------|------|---------|
| **Signal Agent** | Computes deterministic composite risk scores from telemetry z-scores | Pure math (EMA, z-score, weighted formula) |
| **Diagnosis Agent** | Generates structured reasoning capsules explaining *why* risk increased | Bedrock (Claude Sonnet 4.6) |
| **Actions Agent** | Creates/manages incidents with cooldown and deduplication | Deterministic rules matrix |
| **Conversation Agent** | Voice-ready natural language responses via Lex V2 fulfillment | Bedrock (Claude Sonnet 4.6) + SSML |

Risk scoring is deterministic. LLMs enhance explanation -- they do not invent reasoning.

---

## Project Structure

```
streaming-agents/
  apps/lambdas/
    simulator-controller/    # EventBridge-triggered, fans out to workers
    simulator-worker/        # Generates telemetry per scenario
    ingestion/               # Validates, enriches, fans out to ingested stream
    signal-agent/            # Z-score + composite risk computation
    diagnosis-agent/         # Bedrock-powered root cause analysis
    actions-agent/           # Incident lifecycle management
    conversation-agent/      # Lex V2 fulfillment with 5 intents
  packages/
    core-contracts/          # Zod-validated event schemas and types
    core-config/             # Environment variable loading
    core-kinesis/            # Producer/consumer/DLQ wrappers
    core-telemetry/          # OTel SDK wrapper + structured logging
    lambda-base/             # BaseLambdaHandler + NestJS bootstrap
  infra/
    bootstrap/               # OIDC roles, S3/DynamoDB for Terraform state
    modules/                 # Reusable Terraform modules (kinesis, dynamodb, lex)
    envs/dev/                # Dev environment (AWS sandbox)
    envs/localstack/         # Local development
  python/services/
    reachy-exporter/         # Edge telemetry exporter for Reachy Mini
  docs/                      # Architecture, domain, API, and infra docs
  .github/workflows/        # Lambda Build + Terraform Deploy pipelines
```

---

## AWS Resources (Dev)

| Service | Resources |
|---------|-----------|
| Lambda | 7 functions (Node.js 22, 256-512MB) |
| Kinesis | 5 streams (r17-telemetry, r17-ingested, r17-risk-events, r17-diagnosis, r17-actions) |
| DynamoDB | 2 tables (asset-state, incidents with GSI) |
| SQS | 4 dead-letter queues |
| Lex V2 | 1 bot, 5 intents (AssetStatus, FleetOverview, ExplainRisk, RecommendAction, AcknowledgeIncident) |
| Bedrock | Claude Sonnet 4.6 via US inference profile |
| EventBridge | Simulator cron (rate-based, disabled by default) |
| S3 | Lambda artifact storage + Terraform state |

---

## CI/CD

Two GitHub Actions workflows:

1. **Lambda Build** -- Builds TypeScript + Python Lambdas, runs tests, uploads zips to S3
2. **Terraform Deploy** -- Auto-triggered after Lambda Build; downloads artifacts from S3, runs `terraform apply`

Artifacts are keyed by commit SHA in S3 for traceability.

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- uv (Python package manager)
- Terraform 1.9+
- Docker (for LocalStack)

### Local Development

```bash
# Install dependencies
pnpm install
cd python && uv sync && cd ..

# Start LocalStack
docker compose up -d

# Apply Terraform
cd infra/envs/localstack && terraform init && terraform apply

# Build all packages
pnpm build

# Run tests
pnpm test
```

### AWS Deployment

Handled automatically via CI/CD on push to `main`. Manual trigger available via GitHub Actions `workflow_dispatch`.

---

## Lex V2 Intents

| Intent | Example Utterance | Requires Bedrock |
|--------|-------------------|-----------------|
| AssetStatus | "What is the status of R-17?" | Yes |
| FleetOverview | "How are the robots?" | Yes |
| ExplainRisk | "Why is R-17 critical?" | Yes |
| RecommendAction | "What should I do about R-17?" | Yes (when incident exists) |
| AcknowledgeIncident | "Acknowledge R-17" | No |

---

## Risk Scoring Formula (Locked)

```
composite_risk = (0.35 * |pos_z|) + (0.25 * |accel_z|) + (0.15 * |gyro_z|)
               + (0.15 * |temp_z|) + (0.10 * threshold_breach)

Normalized: / 3.0, clamped [0, 1]

States: nominal (<0.50) | elevated (0.50-0.75) | critical (>=0.75)
```

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Repository & Tooling Foundation | Complete |
| 2 | Streaming Telemetry Pipeline | Complete (105 tests) |
| 3 | Diagnosis & Actions Agents | Complete (85 tests) |
| 4 | Conversational Copilot | Complete (Lex + Bedrock live on AWS) |
| 5 | Demo, Article & Deployment | In Progress |

**Deadline:** March 13, 2026 (AIdeas Builder Center article submission)

---

## Guardrails

- Risk scoring must remain deterministic
- LLMs enhance explanation -- they do not generate reasoning logic
- No computer vision pipelines
- No robotics autonomy modeling
- Strict phase discipline enforced via `docs/ai/tasks.md`
