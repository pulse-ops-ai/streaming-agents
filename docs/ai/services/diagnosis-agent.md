# Service Contract: Diagnosis Agent

## Identity
- **Service:** `diagnosis-agent`
- **Location:** `apps/lambdas/diagnosis-agent/`
- **Runtime:** NestJS on AWS Lambda
- **Trigger:** Kinesis stream `r17-risk-events` (event source mapping)
- **Phase:** 3.4

## Purpose

The Diagnosis Agent is the LLM-powered explanation stage. It receives risk events
from the Signal Agent, calls Amazon Bedrock (Claude Sonnet) to generate a
human-readable root cause analysis, and emits structured diagnosis events for
downstream action. It does NOT compute risk scores — it explains scores computed
by the Signal Agent.

## What It Receives

`RiskEvent` from Kinesis stream `r17-risk-events` (produced by Signal Agent).

## What It Does

For each `RiskEvent`:

1. **Extract risk event** from Kinesis record (base64 decode → JSON parse)
2. **Skip if nominal** — if `risk_state === 'nominal'`, return `{ status: 'skip' }`.
   No Bedrock call, no DynamoDB read, no output event. This saves Bedrock cost
   during normal operations.
3. **Debounce check** — load `last_diagnosis_at` from DynamoDB `asset-state` table
   (same table as Signal Agent, extended with this field):
   ```typescript
   const elapsed = Date.now() - new Date(state.last_diagnosis_at).getTime();
   if (elapsed < DIAGNOSIS_DEBOUNCE_MS) {
     return { status: 'skip', reason: 'debounce' };
   }
   ```
   Default debounce: 30,000 ms (30 seconds). Prevents Bedrock cost explosion
   when multiple risk events arrive in rapid succession for the same asset.
4. **Load asset state** from DynamoDB (baselines, z-scores, last values, reading count)
5. **Build structured prompt** for Bedrock:
   ```typescript
   const prompt = `You are a predictive maintenance expert analyzing telemetry from
   a Reachy Mini robotic actuator.

   ## Asset: ${riskEvent.asset_id}
   ## Current Risk State: ${riskEvent.risk_state} (composite score: ${riskEvent.composite_risk.toFixed(3)})

   ## Signal Analysis
   | Signal | Raw Value | Z-Score | Contributing? |
   |--------|-----------|---------|---------------|
   | Joint Position Error (deg) | ${lastValues.joint_position_error_deg} | ${zScores.position_error_z.toFixed(2)} | ${contributing.includes('position_error') ? 'YES' : 'no'} |
   | Acceleration (m/s²) | ${lastValues.accel_magnitude_ms2} | ${zScores.accel_z.toFixed(2)} | ${contributing.includes('accel') ? 'YES' : 'no'} |
   | Gyroscope (rad/s) | ${lastValues.gyro_magnitude_rads} | ${zScores.gyro_z.toFixed(2)} | ${contributing.includes('gyro') ? 'YES' : 'no'} |
   | Board Temperature (°C) | ${lastValues.board_temperature_c} | ${zScores.temperature_z.toFixed(2)} | ${contributing.includes('temperature') ? 'YES' : 'no'} |

   ## Threshold Breach: ${riskEvent.threshold_breach} (0.0=none, 0.5=warn, 1.0=critical)

   ## Signal Descriptions
   - joint_position_error_deg: Deviation between commanded and actual joint angle. High values indicate servo lag, mechanical binding, or load beyond actuator capacity.
   - accel_magnitude_ms2: Combined linear acceleration magnitude. Spikes indicate impacts, vibration, or sudden movement changes.
   - gyro_magnitude_rads: Angular velocity magnitude. Elevated values suggest oscillation, instability, or uncontrolled rotation.
   - board_temperature_c: Controller board temperature. Rising values indicate thermal stress from sustained high load or inadequate cooling.

   ## Instructions
   Analyze the signals and provide a JSON response with this exact structure:
   {
     "root_cause": "<concise 1-2 sentence explanation of the likely failure mode>",
     "evidence": [
       { "signal": "<signal_name>", "observation": "<what this signal shows>", "z_score": <number> }
     ],
     "confidence": "low" | "medium" | "high",
     "recommended_actions": ["<action 1>", "<action 2>"],
     "severity": "info" | "warning" | "critical"
   }

   Rules:
   - Include only signals with |z_score| > 2.0 in evidence
   - severity must match: elevated risk → "warning", critical risk → "critical"
   - recommended_actions should be specific to robotic actuators (e.g., "reduce joint velocity", "inspect servo motor", "check cooling fan")
   - confidence is "high" when multiple correlated signals confirm the diagnosis, "medium" for single signal anomalies, "low" when signals are ambiguous
   - Respond with ONLY the JSON object, no markdown fencing or explanation`;
   ```
6. **Call Bedrock** — `InvokeModel` with Claude Sonnet (`anthropic.claude-sonnet-4-20250514`):
   ```typescript
   const response = await bedrockClient.send(new InvokeModelCommand({
     modelId: config.bedrockModelId,
     contentType: 'application/json',
     accept: 'application/json',
     body: JSON.stringify({
       anthropic_version: 'bedrock-2023-05-31',
       max_tokens: 512,
       messages: [{ role: 'user', content: prompt }],
     }),
   }));
   ```
7. **Parse response** with Zod schema:
   ```typescript
   const DiagnosisResponseSchema = z.object({
     root_cause: z.string(),
     evidence: z.array(z.object({
       signal: z.string(),
       observation: z.string(),
       z_score: z.number(),
     })),
     confidence: z.enum(['low', 'medium', 'high']),
     recommended_actions: z.array(z.string()),
     severity: z.enum(['info', 'warning', 'critical']),
   });
   ```
   If parsing fails → `{ status: 'dlq', reason: 'MALFORMED_LLM_RESPONSE' }`.
   Extract `prompt_tokens` and `completion_tokens` from Bedrock response metadata.
8. **Update debounce timestamp** — write `last_diagnosis_at` to DynamoDB `asset-state`
9. **Emit DiagnosisEvent** to Kinesis stream `r17-diagnosis` (partition key: `asset_id`):
   ```typescript
   interface DiagnosisEvent {
     event_id: string;          // UUID v4
     trace_id: string;          // propagated from RiskEvent
     asset_id: string;
     timestamp: string;         // ISO 8601
     risk_state: 'nominal' | 'elevated' | 'critical';
     composite_risk: number;
     root_cause: string;
     evidence: Array<{
       signal: string;
       observation: string;
       z_score: number;
     }>;
     confidence: 'low' | 'medium' | 'high';
     recommended_actions: string[];
     severity: 'info' | 'warning' | 'critical';
     model_id: string;          // Bedrock model used
     prompt_tokens: number;     // for cost tracking
     completion_tokens: number; // for cost tracking
   }
   ```

## What It Emits

`DiagnosisEvent` to Kinesis stream `r17-diagnosis`.

## What It Must NOT Do

- Must NOT compute risk scores or z-scores — those come from Signal Agent
- Must NOT modify asset baselines — Signal Agent owns baselines
- Must NOT take actions (create incidents, send alerts) — that's the Actions Agent
- Must NOT call Bedrock for `risk_state === 'nominal'` — cost control
- Must NOT use freeform/user-supplied prompts — prompt is templated
- Must NOT trust LLM output without Zod validation — malformed responses go to DLQ
- Must NOT exceed 1 Bedrock call per asset per debounce window (30s default)

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KINESIS_INPUT_STREAM` | yes | — | Source stream (r17-risk-events) |
| `KINESIS_OUTPUT_STREAM` | yes | — | Diagnosis events stream (r17-diagnosis) |
| `DYNAMODB_TABLE` | yes | — | Asset state table name (shared with Signal Agent) |
| `DLQ_QUEUE_URL` | yes | — | DLQ for malformed LLM responses |
| `BEDROCK_MODEL_ID` | no | `anthropic.claude-sonnet-4-20250514` | Bedrock model identifier |
| `BEDROCK_REGION` | no | `us-east-1` | AWS region for Bedrock API |
| `DIAGNOSIS_DEBOUNCE_MS` | no | `30000` | Min interval between Bedrock calls per asset |
| `AWS_REGION` | yes | — | AWS region |
| `OTEL_SERVICE_NAME` | no | `diagnosis-agent` | OTel service name |

## Dependencies

- `@streaming-agents/core-contracts` — RiskEvent, DiagnosisEvent types
- `@streaming-agents/core-config` — validated env config
- `@streaming-agents/core-telemetry` — OTel trace continuation
- `@streaming-agents/core-kinesis` — Kinesis consumer/producer
- `@streaming-agents/lambda-base` — BaseLambdaHandler
- `@aws-sdk/client-bedrock-runtime` — Bedrock InvokeModel
- `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` — DynamoDB access

## OTel Instrumentation

- Span: `diagnosis-agent.process` (continues trace from signal-agent)
  - `telemetry.asset_id`
  - `signal.risk_state`
  - `signal.composite_risk`
  - `diagnosis.confidence`
  - `diagnosis.severity`
- Span: `diagnosis-agent.debounce-check` (child)
- Span: `diagnosis-agent.bedrock.invoke` (child)
  - `bedrock.model_id`
  - `bedrock.prompt_tokens`
  - `bedrock.completion_tokens`
- Span: `diagnosis-agent.parse` (child)
- Span: `diagnosis-agent.emit` (child)
- Metric: `diagnosis_agent.events_processed` (counter, tags: risk_state)
- Metric: `diagnosis_agent.events_skipped` (counter, tags: reason)
- Metric: `diagnosis_agent.bedrock_latency_ms` (histogram)
- Metric: `diagnosis_agent.tokens_used` (counter, tags: token_type)

## Asset State Extension

The Diagnosis Agent extends the existing `streaming-agents-asset-state` DynamoDB
table (owned by Signal Agent) with one additional field:

```typescript
interface AssetState {
  // ... existing fields from Signal Agent ...
  last_diagnosis_at?: string;  // ISO 8601, updated by Diagnosis Agent
}
```

No new DynamoDB table is needed. The `last_diagnosis_at` field is written by the
Diagnosis Agent after each successful Bedrock call and read during the debounce
check. Signal Agent ignores this field.
