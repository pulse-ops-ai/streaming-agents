# System Context

Streaming Agents operates as a real-time event-driven system.

Telemetry → Risk Engine → Incident Store → Conversational Layer → Voice Interface

## High-Level Flow

1. Telemetry sources (Reachy Mini edge exporter or fleet simulator) publish readings to Kinesis.
2. Events are streamed through the ingestion pipeline into Kinesis.
3. Signal Agent computes rolling anomaly baselines and composite risk scores.
4. If risk crosses threshold:
   - Diagnosis Agent generates a DiagnosisEvent (structured reasoning capsule).
   - Actions Agent creates or escalates an incident.
5. Conversation Agent reads DynamoDB state on demand and responds to operator voice queries.
6. Voice interface (Lex V2 + Polly) provides natural interaction through the robot's speaker.

---

## Deployment Modes

### Local Development
- Terraform
- LocalStack Ultimate
- Kinesis, Lambda, DynamoDB emulated locally
- MockBedrockAdapter for LLM inference

### AWS Sandbox
- Kinesis Data Streams
- Lambda
- DynamoDB
- Bedrock (Claude Sonnet 4.6)
- Lex V2 + Polly
- Managed Grafana + CloudWatch

---

## Core Design Goal

Make predictive maintenance:

- Real-time
- Explainable
- Conversational
- Demonstrable within <5 minutes
