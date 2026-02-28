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

The generated response should include SSML hints for Amazon Polly:
- Use `<emphasis>` on critical values (e.g., "The temperature is <emphasis level='strong'>critical</emphasis>.")
- Use `<break>` between logical sections.

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

## OTel Instrumentation

Unlike Kinesis consumers, this agent handles synchronous HTTP-like requests. A new trace is started for each Lex invocation.

- Span: `conversation.fulfill` (Root span for the Lex request)
  - `lex.intent.name`
  - `lex.slots.asset_id`
- Span: `conversation.query-state` (Child span for DynamoDB lookups)
- Span: `conversation.bedrock.invoke` (Child span for LLM generation)
  - `bedrock.model_id`
  - `bedrock.prompt_tokens`
  - `bedrock.completion_tokens`
- Span: `conversation.format-response` (Child span for final SSML assembly)
