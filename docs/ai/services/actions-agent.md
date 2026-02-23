# Service Contract: Actions Agent

## Identity
- **Service:** `actions-agent`
- **Location:** `apps/lambdas/actions-agent/`
- **Runtime:** NestJS on AWS Lambda
- **Trigger:** Kinesis stream `r17-diagnosis` (event source mapping)
- **Phase:** 3.5

## Purpose

The Actions Agent is the deterministic response stage. It receives diagnosis events,
applies rule-based action logic to manage incident lifecycle, and emits action events
for downstream consumers. All decisions are deterministic — NO LLM calls. The agent
manages the incident lifecycle (opened → escalated → resolved) in DynamoDB.

## What It Receives

`DiagnosisEvent` from Kinesis stream `r17-diagnosis` (produced by Diagnosis Agent).

## What It Does

For each `DiagnosisEvent`:

1. **Extract diagnosis event** from Kinesis record (base64 decode → JSON parse)
2. **Load active incident** for `asset_id` from DynamoDB `streaming-agents-incidents`
   table. Query the GSI (`asset_id-status-index`) filtering for `status != 'resolved'`:
   ```typescript
   const incident = await incidentRepository.getActiveIncident(event.asset_id);
   // Returns the single active incident or null
   ```
   Constraint: at most one active (non-resolved) incident per `asset_id` at any time.
3. **Evaluate action rules** (deterministic matrix):

   | Severity | Active Incident? | Incident Age | Action | Incident Update |
   |----------|-----------------|--------------|--------|-----------------|
   | `info` | no | — | `monitor` | none |
   | `info` | yes | — | `monitor` | none |
   | `warning` | no | — | `alert` | create (`opened`) |
   | `warning` | yes | < 60s | `alert` | none (already tracked) |
   | `warning` | yes | ≥ 60s | `throttle` | escalate (`escalated`) |
   | `critical` | no | — | `shutdown_recommended` | create (`escalated`) |
   | `critical` | yes (opened) | — | `shutdown_recommended` | escalate (`escalated`) |
   | `critical` | yes (escalated) | — | `shutdown_recommended` | none (already escalated) |

   Incident age is computed as: `Date.now() - new Date(incident.opened_at).getTime()`

4. **Create or update incident** in DynamoDB (if action requires it):
   ```typescript
   // Create new incident
   const incident: IncidentRecord = {
     incident_id: crypto.randomUUID(),
     asset_id: event.asset_id,
     status: severity === 'critical' ? 'escalated' : 'opened',
     opened_at: new Date().toISOString(),
     escalated_at: severity === 'critical' ? new Date().toISOString() : null,
     resolved_at: null,
     root_cause: event.root_cause,
     severity: event.severity,
   };

   // Escalate existing incident
   incident.status = 'escalated';
   incident.escalated_at = new Date().toISOString();
   incident.severity = event.severity;  // may upgrade warning → critical
   ```

5. **Emit ActionEvent** to Kinesis stream `r17-actions` (partition key: `asset_id`):
   ```typescript
   interface ActionEvent {
     event_id: string;               // UUID v4
     trace_id: string;               // propagated from DiagnosisEvent
     asset_id: string;
     timestamp: string;              // ISO 8601
     action: 'monitor' | 'alert' | 'throttle' | 'shutdown_recommended' | 'resolve';
     severity: 'info' | 'warning' | 'critical';
     incident_id: string | null;     // null for monitor action with no incident
     incident_status: 'opened' | 'escalated' | 'resolved' | null;
     reason: string;                 // human-readable explanation of why this action was taken
     diagnosis_event_id: string;     // reference to triggering diagnosis
   }
   ```

## What It Emits

`ActionEvent` to Kinesis stream `r17-actions`.

## What It Must NOT Do

- Must NOT call Bedrock or any LLM — all decisions are deterministic rules
- Must NOT compute risk scores or modify baselines — Signal Agent's domain
- Must NOT send commands to robots — actions are recommendations only
- Must NOT create duplicate incidents — one active incident per `asset_id`
- Must NOT modify DiagnosisEvent or RiskEvent data — read-only consumer

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KINESIS_INPUT_STREAM` | yes | — | Source stream (r17-diagnosis) |
| `KINESIS_OUTPUT_STREAM` | yes | — | Action events stream (r17-actions) |
| `DYNAMODB_INCIDENTS_TABLE` | yes | — | Incidents table name |
| `DLQ_QUEUE_URL` | yes | — | DLQ for processing failures |
| `ESCALATION_THRESHOLD_MS` | no | `60000` | Time before warning → throttle (ms) |
| `AWS_REGION` | yes | — | AWS region |
| `OTEL_SERVICE_NAME` | no | `actions-agent` | OTel service name |

## Dependencies

- `@streaming-agents/core-contracts` — DiagnosisEvent, ActionEvent, IncidentRecord types
- `@streaming-agents/core-config` — validated env config
- `@streaming-agents/core-telemetry` — OTel trace continuation
- `@streaming-agents/core-kinesis` — Kinesis consumer/producer
- `@streaming-agents/lambda-base` — BaseLambdaHandler
- `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` — DynamoDB access

## OTel Instrumentation

- Span: `actions-agent.process` (continues trace from diagnosis-agent)
  - `telemetry.asset_id`
  - `diagnosis.severity`
  - `action.type`
  - `incident.status`
- Span: `actions-agent.load-incident` (child)
- Span: `actions-agent.evaluate` (child)
- Span: `actions-agent.dynamodb.write` (child)
- Span: `actions-agent.emit` (child)
- Metric: `actions_agent.actions_emitted` (counter, tags: action, severity)
- Metric: `actions_agent.incidents_created` (counter, tags: severity)
- Metric: `actions_agent.incidents_escalated` (counter)
- Metric: `actions_agent.dynamodb_latency_ms` (histogram, tags: operation)

## Incident Lifecycle

```
                ┌─────────────┐
                │   (none)    │
                └──────┬──────┘
                       │ first warning or critical
                       ▼
                ┌─────────────┐
          ┌────▶│   opened    │
          │     └──────┬──────┘
          │            │ sustained warning > 60s
          │            │   OR any critical
          │            ▼
          │     ┌─────────────┐
          │     │  escalated  │
          │     └──────┬──────┘
          │            │ risk returns to nominal
          │            │ (separate resolution mechanism)
          │            ▼
          │     ┌─────────────┐
          └─────│  resolved   │
   new incident └─────────────┘
   for same asset
```

**Resolution:** Incidents are resolved when the Signal Agent reports `risk_state === 'nominal'`
for the asset. This is handled by a separate mechanism — the Actions Agent also receives
nominal-state diagnosis events (which are skipped by the Diagnosis Agent) or periodically
checks asset state. Implementation detail deferred to Task 3.5.

## DynamoDB Table Schema

```hcl
resource "aws_dynamodb_table" "incidents" {
  name         = "streaming-agents-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incident_id"

  attribute {
    name = "incident_id"
    type = "S"
  }

  attribute {
    name = "asset_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "asset_id-status-index"
    hash_key        = "asset_id"
    range_key       = "status"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}
```

## IncidentRecord Schema

```typescript
interface IncidentRecord {
  incident_id: string;          // PK, UUID v4
  asset_id: string;             // GSI hash key
  status: 'opened' | 'escalated' | 'resolved';  // GSI range key
  opened_at: string;            // ISO 8601
  escalated_at: string | null;  // ISO 8601, set on escalation
  resolved_at: string | null;   // ISO 8601, set on resolution
  root_cause: string;           // from initial DiagnosisEvent
  severity: 'info' | 'warning' | 'critical';  // current severity
  expires_at?: number;          // TTL epoch seconds (set on resolution)
}
```
