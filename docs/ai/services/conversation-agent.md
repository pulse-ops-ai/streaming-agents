# Service Contract: Conversation Agent

## Identity
- **Service:** `conversation-agent`
- **Location:** `apps/lambdas/conversation-agent/`
- **Runtime:** NestJS on AWS Lambda
- **Trigger:** Amazon Lex V2 Fulfillment (synchronous request/response)
- **Phase:** 4.3

## Purpose

The Conversation Agent acts as the fulfillment hook for an Amazon Lex V2 bot. It provides a natural language copilot interface for operators to query the state of the robotic fleet, ask for explanations of elevated risk, get actionable recommendations, and acknowledge active incidents. It translates Lex intents into DynamoDB queries, passes the context to Amazon Bedrock (Claude) for natural language generation, and returns the response to Lex (which may then be synthesized by Amazon Polly).

This agent uses a synchronous request/response model, not the asynchronous Kinesis event pipeline used by the other agents.

## What It Receives

`LexFulfillmentRequest` from Amazon Lex V2.

```typescript
// defined in packages/core-contracts/src/lex.ts
interface LexFulfillmentRequest {
  sessionState: {
    intent: {
      name: string; // The matched intent (e.g., 'AssetStatus')
      slots: Record<string, { value: { interpretedValue: string } }>;
      state: string;
    };
    sessionAttributes: Record<string, string>;
  };
  inputTranscript: string;
}
```

## Supported Intents & Actions

### 1. `AssetStatus`
- **Utterances:** "How is R-17?", "What's the status of R-17?"
- **Slots:** `asset_id` (required)
- **Fulfillment:** Load `AssetState` from DynamoDB.
  - If `risk_state === 'nominal'`, return static success message (skip Bedrock).
  - If elevated/critical, summarize risk state and key signals using Bedrock.

### 2. `FleetOverview`
- **Utterances:** "Any alerts?", "Show me the fleet", "How are the robots?"
- **Slots:** None
- **Fulfillment:** Scan DynamoDB `asset-state` for all assets where `risk_state != 'nominal'`.
  - If all nominal, return static "All systems nominal, no alerts." (skip Bedrock).
  - If anomalies exist, summarize the fleet health using Bedrock.

### 3. `ExplainRisk`
- **Utterances:** "Why is R-17 critical?", "What's wrong with R-17?"
- **Slots:** `asset_id` (required)
- **Fulfillment:** Load `AssetState` from DynamoDB. Query DynamoDB `incidents` table for the most recent root cause, OR use the `last_event_id` to look up context if available. Pass diagnosis data to Bedrock to explain the root cause and evidence.

### 4. `RecommendAction`
- **Utterances:** "What should I do about R-17?"
- **Slots:** `asset_id` (required)
- **Fulfillment:** Query DynamoDB `incidents` for the active incident on the asset. Pass the `root_cause` and current `status` to Bedrock, returning recommended actions to the operator.

### 5. `AcknowledgeIncident`
- **Utterances:** "Acknowledge R-17", "I'm on it"
- **Slots:** `asset_id` (required)
- **Fulfillment:** Update the active incident record in DynamoDB with an acknowledgment timestamp (or emit an acknowledgment event). Return a confirmation message.

## What It Emits

`LexFulfillmentResponse` sent synchronously back to Amazon Lex V2.

```typescript
// defined in packages/core-contracts/src/lex.ts
interface LexFulfillmentResponse {
  sessionState: {
    dialogAction: {
      type: 'Close';
    };
    intent: {
      name: string;
      state: 'Fulfilled' | 'Failed';
    };
  };
  messages: Array<{
    contentType: 'PlainText' | 'SSML';
    content: string;
  }>;
}
```

## Response Generation (Bedrock)

For complex queries requiring explanation (e.g., `ExplainRisk`, `RecommendAction`), the Lambda builds a context object from DynamoDB and passes it to Bedrock (Claude Sonnet).

**System Prompt Example:**
> "You are a maintenance copilot for a robotic fleet. Speak concisely like a helpful colleague. Use plain language, not technical jargon. Keep responses under 3 sentences unless asked for detail."

SSML is generated deterministically by the `enhanceForSpeech()` utility after Bedrock returns plain text. Handlers return a `speechContext` object (`{ severity, intentName, hasIncident }`) and the response builder applies Polly-neural-compatible SSML transforms (prosody, breaks, say-as for robot IDs and numbers).

## What It Must NOT Do

- **Must NOT modify risk scores or baselines.** (Owned by Signal Agent).
- **Must NOT take direct robot control actions.** (Recommendations only).
- **Must NOT call Bedrock for simple nominal status checks.** (Use static responses to save cost and latency).
- **Must NOT expose raw z-scores or technical internals** unless explicitly asked.

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DYNAMODB_ASSET_TABLE` | yes | `streaming-agents-asset-state` | Asset state table name |
| `DYNAMODB_INCIDENTS_TABLE` | yes | `streaming-agents-incidents` | Incidents table name |
| `BEDROCK_MODEL_ID` | no | `anthropic.claude-sonnet-4-20250514` | Bedrock model identifier |
| `BEDROCK_REGION` | no | `us-east-1` | AWS region for Bedrock API |
| `AWS_REGION` | yes | — | AWS region |
| `OTEL_SERVICE_NAME` | no | `conversation-agent` | OTel service name |

## Dependencies

- `@streaming-agents/core-contracts` — Updated to include Lex payload types.
- `@streaming-agents/core-config` — validated env config
- `@streaming-agents/core-telemetry` — OTel tracing implementation
- `@aws-sdk/client-bedrock-runtime` — Bedrock InvokeModel
- `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` — DynamoDB access

## Structured Log Events

The router emits four structured JSON log events to CloudWatch, all sharing a common base with `service: 'conversation-agent'`. These events are the primary data source for Grafana dashboards.

| Event | Level | When | Key Fields |
|-------|-------|------|------------|
| `conversation.request_received` | info | Lex request arrives | `intent_name_raw`, `transcript_text` (gated), `fleet_scope`, `channel` |
| `conversation.intent_resolved` | info | Intent mapped to handler | `intent_name_resolved`, `slot_values`, `fallback_used`, `handler_name` |
| `conversation.response_generated` | info | Handler returns successfully | `used_bedrock`, `bedrock_model_id`, `input_tokens`, `output_tokens`, `total_tokens`, `response_type`, `response_confidence`, `duration_ms` |
| `conversation.request_failed` | error | Unhandled error in handler | `failure_stage`, `error_code`, `error_message`, `asset_id`, `bedrock_model_id` (if Bedrock failure), `duration_ms` |

**Privacy rules:** `transcript_text` is gated by `LOG_TRANSCRIPT` env var (default true). Raw audio and full Bedrock prompts/responses are never logged. `response_summary` is truncated to 120 characters.

### Bedrock Token Usage

When `used_bedrock` is true, `conversation.response_generated` includes:

| Field | Type | Description |
|-------|------|-------------|
| `input_tokens` | number | Tokens sent to Bedrock |
| `output_tokens` | number | Tokens returned by Bedrock |
| `total_tokens` | number | `input_tokens + output_tokens` |
| `bedrock_model_id` | string | Model ID used for the invocation |

## OTel Instrumentation

### Traces

Unlike Kinesis consumers, this agent handles synchronous HTTP-like requests. A new trace is started for each Lex invocation.

- Span: `conversation.fulfill` (Root span for the Lex request)
  - `lex.intent.name`
  - `lex.session.id`
- Span: `conversation.format-response` (Child span for response building)

### Metrics

Emitted via `TelemetryService` when `used_bedrock` is true (auto-prefixed with `streaming_agents.`):

| Metric | Type | Tags | Description |
|--------|------|------|-------------|
| `conversation_bedrock_invocations_total` | counter | `intent_name_resolved`, `model_id`, `channel` | Bedrock calls per intent |
| `conversation_bedrock_duration_ms` | histogram | same | End-to-end handler duration |
| `conversation_bedrock_input_tokens_total` | gauge | same | Input tokens per invocation |
| `conversation_bedrock_output_tokens_total` | gauge | same | Output tokens per invocation |
| `conversation_bedrock_total_tokens_total` | gauge | same | Total tokens per invocation |
