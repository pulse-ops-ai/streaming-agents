# System Context

Streaming Agents operates as a real-time event-driven system.

Telemetry → Risk Engine → Incident Store → Conversational Layer → Voice Interface

## High-Level Flow

1. IoT devices publish telemetry.
2. Events are streamed into Kinesis.
3. Signal Agent computes rolling anomaly and risk.
4. If risk crosses threshold:
   - Actions Agent creates incident.
   - Diagnosis Agent generates reasoning capsule.
5. Conversation Agent retrieves state and responds to user queries.
6. Voice interface provides natural interaction.

---

## Deployment Modes

### Local Development
- Terraform
- LocalStack Ultimate
- Kinesis, Lambda, DynamoDB emulated locally
- Stub or local LLM provider

### AWS Sandbox
- AWS IoT Core
- Kinesis Data Streams
- Lambda
- DynamoDB
- Bedrock
- Lex / Polly (optional)

---

## Core Design Goal

Make predictive maintenance:

- Real-time
- Explainable
- Conversational
- Demonstrable within <5 minutes
