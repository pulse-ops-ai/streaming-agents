# Streaming Agents

## Robotics Uptime Intelligence for Embodied AI

Streaming Agents is a real-time predictive maintenance copilot for robotic fleet telemetry, combining streaming ingestion, deterministic risk scoring, and conversational incident response in a voice-driven operator experience.

**Live on AWS** | 7 Lambda functions | 5 Kinesis streams | Amazon Lex V2 + Bedrock (Claude Sonnet 4.6) | Full CI/CD via GitHub Actions

---

## What It Does

Streaming Agents continuously monitors live telemetry from a fleet of robots and detects mechanical degradation through rolling deterministic anomaly baselines. When risk levels become elevated, it proactively diagnoses the root cause and creates explainable incident records. Rather than relying solely on visual dashboards, operators can directly converse with the robotic assets via voice—asking for fleet statuses, diagnostic explanations, or recommended actions—and hear the AI respond through the robot's own speaker.

## Architecture

```
Telemetry Source (Reachy Mini / Fleet Simulator)
    |
    v
Kinesis: r17-telemetry
    |
    v
Ingestion Lambda ──> Kinesis: r17-ingested
                          |
                          v
                    Signal Agent ──> DynamoDB: asset-state
                          |              + Kinesis: r17-risk-events
                          v
                    Diagnosis Agent (Bedrock) ──> Kinesis: r17-diagnosis
                          |
                          v
                    Actions Agent ──> DynamoDB: incidents
                                          + Kinesis: r17-actions

                    ┌──────────────────────────┐
                    │  Conversation Agent       │
                    │  (query-driven, not       │
                    │   pipeline-downstream)    │
                    │                           │
                    │  Lex V2 ──> Lambda ──>    │
                    │  reads DynamoDB ──>       │
                    │  Bedrock ──> SSML/Polly   │
                    └──────────────────────────┘
```

### Agents

| Agent | Role | Backing |
|-------|------|---------|
| **Signal Agent** | Computes deterministic composite risk scores from telemetry z-scores | Pure math (EMA, z-score, weighted formula) |
| **Diagnosis Agent** | Generates structured DiagnosisEvents explaining *why* risk increased | Bedrock (Claude Sonnet 4.6) |
| **Actions Agent** | Creates/manages incidents with cooldown and deduplication | Deterministic rules matrix |
| **Conversation Agent** | Voice-ready natural language responses via Lex V2 fulfillment | Bedrock (Claude Sonnet 4.6) + SSML |

## The Robot

R-17 is a **Reachy Mini** — a wireless, Raspberry Pi 5-powered desktop robot. An edge exporter runs as a systemd service on the RPi5, reading live positional and state telemetry at 2 Hz directly from the robot's hardware daemon. IMU signals (accelerometer, gyroscope) are fully defined in the telemetry schema and supported by the fleet simulator; exporter IMU integration is in progress.

The voice terminal runs as a native Reachy daemon application. It captures operator speech through the built-in 4-microphone array, sends it to Amazon Lex for intent recognition, and plays back Polly TTS responses through the robot's speaker.

## AWS Stack

| Service | Role |
|---------|------|
| **Amazon Kinesis Data Streams** | 5 streams forming the real-time telemetry pipeline backbone |
| **AWS Lambda** | 7 functions: simulator (controller + worker), ingestion, signal/diagnosis/actions/conversation agents |
| **Amazon DynamoDB** | Asset state with rolling baselines, incident tracking with GSI |
| **Amazon Bedrock (Claude Sonnet 4.6)** | Powers diagnosis explanations and conversational responses |
| **Amazon Lex V2** | Voice input — natural language understanding with 5 custom intents |
| **Amazon Polly** | Neural voice output — R-17 speaks its own health status |
| **Amazon EventBridge** | Cron scheduling for fleet simulation |
| **Amazon Managed Grafana** | Fleet overview dashboard with real-time CloudWatch metrics and log panels |
| **Amazon CloudWatch** | Metrics, structured logs, and observability for pipeline health |
| **Amazon SQS** | Dead-letter queues for pipeline reliability (4 DLQs) |
| **Amazon S3** | Lambda artifact storage for CI/CD pipeline |

## Monorepo Structure

```
streaming-agents/
├── apps/lambdas/                      # 7 Lambda services
│   ├── simulator-controller/          # EventBridge cron → fan-out workers
│   ├── simulator-worker/              # Deterministic telemetry scenarios
│   ├── ingestion/                     # Schema validation + enrichment
│   ├── signal-agent/                  # Z-score + composite risk scoring
│   ├── diagnosis-agent/               # Bedrock root cause analysis
│   ├── actions-agent/                 # Incident lifecycle management
│   └── conversation-agent/            # Lex V2 fulfillment + SSML
├── packages/                          # 6 shared TypeScript packages
│   ├── schemas/                       # Zod schemas + JSON Schema generation
│   ├── core-contracts/                # Event types (IngestedEvent, RiskEvent, etc.)
│   ├── core-config/                   # Zod-validated env var loading
│   ├── core-telemetry/                # OTel wrapper + structured logging
│   ├── core-kinesis/                  # Kinesis producer/consumer/DLQ
│   └── lambda-base/                   # BaseLambdaHandler + NestJS bootstrap
├── python/
│   ├── packages/streaming_agents_core/  # Pydantic telemetry models
│   └── services/
│       ├── reachy-exporter/           # Edge telemetry (RPi5 systemd service)
│       └── reachy-voice/              # Voice terminal (Reachy daemon app)
├── infra/
│   ├── envs/dev/                      # AWS sandbox Terraform
│   ├── envs/localstack/               # Local development Terraform
│   ├── bootstrap/                     # OIDC, Terraform state, edge IAM
│   └── grafana/                       # Dashboard JSON provisioning
├── .kiro/agents/                      # 5 Kiro code review agents
├── .github/workflows/                 # CI/CD (Lambda Build + Terraform Deploy)
└── docs/                              # Architecture, domain, and service contracts
```

## Key Design Decisions

- **Risk formula is deterministic** — LLM never computes risk scores
- **Contracts before code** — service contracts + Kiro agents defined before implementation
- **Hexagonal architecture** — BaseLambdaHandler with pure `process()` methods
- **Real hardware** — edge exporter reads actual robot sensors, not just simulation
- **Conversation Agent is query-driven** — reads DynamoDB on demand, not a pipeline consumer

## Test Coverage

- 105+ TypeScript unit tests (packages + Lambda services)
- 59 Python tests (exporter + voice terminal)
- End-to-end validated on LocalStack and real AWS

## Quick Start

### Prerequisites
- Node.js 22+, pnpm 9+
- Python 3.12+, uv
- Terraform 1.5+
- AWS CLI configured

### Build
```bash
pnpm install
pnpm build
pnpm test
```

### Local (LocalStack)
```bash
cd infra/envs/localstack
terraform init && terraform apply
```

### Deploy (AWS)
Pushes to main auto-deploy via GitHub Actions (OIDC, no stored credentials).

## License

MIT
