# Architecture: Lex Voice Pipeline

This document defines the architecture of the Phase 4 Voice-Driven Conversation Agent, integrating Amazon Lex V2, AWS Lambda, Amazon Bedrock, and Amazon Polly.

---

## 1. System Overview

```
 ┌─────────────┐        ┌─────────────┐       ┌─────────────┐
 │    User     ├───────▶│ Amazon Lex  ├──────▶│ Fulfillment │
 │  (Speech/   │        │     V2      │       │   Lambda    │
 │   Text)     │◀───────┤   (Intent   │◀──────┤             │
 └─────────────┘        │ Resolution) │       └──────┬──────┘
        ▲               └─────────────┘              │
        │                                            ▼
 ┌──────┴──────┐                              ┌─────────────┐
 │ Amazon Polly│     ┌─────────────┐          │  DynamoDB   │
 │   (SSML     │◀────┤   Amazon    │◀─────────┤ (State &    │
 │  to Audio)  │     │   Bedrock   │          │  Incidents) │
 └─────────────┘     └─────────────┘          └─────────────┘
```

## 2. Amazon Lex V2 Configuration

- **Bot Name:** `StreamingAgentsCopilot`
- **Locale:** `en_US`
- **Voice:** Null (Voice handled externally by Polly for demo)
- **Session Timeout:** 5 minutes

### Intents & Slots

#### `AssetStatus`
- **Description:** Ask for the current baseline and risk state of a specific robot.
- **Sample Utterances:**
  - "How is {asset_id}?"
  - "What's the status of {asset_id}?"
  - "Tell me about robot {asset_id}"
- **Slots:**
  - `asset_id`: Required. Type: `AMAZON.AlphaNumeric` (or custom `AssetIdType` regex: `^R-\d+$`)

#### `FleetOverview`
- **Description:** Get a summary of all active alerts across the fleet.
- **Sample Utterances:**
  - "Show me the fleet"
  - "Any alerts?"
  - "How are the robots doing?"
  - "Is there anything I need to look at?"
- **Slots:** None

#### `ExplainRisk`
- **Description:** Drill down into why an asset is exhibiting elevated or critical risk.
- **Sample Utterances:**
  - "Why is {asset_id} critical?"
  - "What's wrong with {asset_id}?"
  - "Give me the diagnosis for {asset_id}"
- **Slots:**
  - `asset_id`: Required. Type: `AMAZON.AlphaNumeric`

#### `RecommendAction`
- **Description:** Ask for recommended remediation steps for an active incident.
- **Sample Utterances:**
  - "What should I do about {asset_id}?"
  - "How do I fix {asset_id}?"
- **Slots:**
  - `asset_id`: Required. Type: `AMAZON.AlphaNumeric`

#### `AcknowledgeIncident`
- **Description:** Mark an active incident as acknowledged by the operator.
- **Sample Utterances:**
  - "I'm on it for {asset_id}"
  - "Acknowledge {asset_id}"
- **Slots:**
  - `asset_id`: Required. Type: `AMAZON.AlphaNumeric`

#### `FallbackIntent`
- **Description:** Default intent when Lex cannot map the user's input.
- **Fulfillment:** "I'm not sure what you mean. Try asking about a specific robot like R-17, or ask for a fleet overview."

## 3. Fulfillment Lambda Strategy

The `conversation-agent` Lambda acts as the sole fulfillment hook for the Lex bot.

When an intent is resolved by Lex, it invokes the Lambda via a synchronous payload (Lex V2 Fulfillment format).

1. The Lambda switches on `event.sessionState.intent.name`.
2. It extracts slot values like `asset_id`.
3. It queries `streaming-agents-asset-state` or `streaming-agents-incidents` in DynamoDB.
4. For complex intents (`ExplainRisk`, `RecommendAction`, or anomalous `FleetOverview`), it calls Anthropic Claude Sonnet via Amazon Bedrock with a strict system prompt.
5. It returns the response as `PlainText` or `SSML` in the `LexFulfillmentResponse`.

## 4. SSML & Amazon Polly

To make the AI voice sound natural and urgent when necessary, we return SSML to Amazon Lex, which can be piped to Amazon Polly.

- **Neural Voice:** `Matthew` or `Joanna` (en-US, neural engine)
- **SSML Strategy:**
  - **Emphasis:** `<emphasis level="strong">critical</emphasis>`
  - **Pacing:** `<prosody rate="fast">nominal</prosody>` vs `<prosody rate="slow">thermal runaway</prosody>`
  - **Breaks:** Use `<break time="500ms"/>` to separate logical clauses (e.g., between the root cause and the recommended actions).

## 5. Local Dev & Testing Constraints

**CRITICAL NOTE ON LOCALSTACK:** LocalStack Community does not fully support Amazon Lex V2 or Amazon Polly.

To test the Conversation Agent locally without a real AWS account:

1. Do NOT test by invoking Lex locally.
2. Instead, mock the Lex V2 JSON event payload and invoke the Lambda directly.
3. Use a tool like `aws lambda invoke` against the local `tflocal` environment to send a mock `LexFulfillmentRequest`.
4. Verify the Lambda responds with a properly formatted `LexFulfillmentResponse` containing the expected language or SSML.

For the final article video and E2E demonstration, the Lex Bot and Polly pipelines must be deployed to the `aws-sandbox` real AWS account.
