# Architecture: Event Schema Contract

This document defines every event type that flows through the streaming-agents
pipeline. JSON Schemas live in `contracts/kinesis/`. TypeScript types live in
`packages/core-contracts/`. Both MUST stay in sync.

---

## Schema Versioning Rules

1. All schemas use semantic versioning in the topic/stream name: `r17-telemetry` (v2 implied by schema)
2. Breaking changes require a new stream name (e.g., `r17-telemetry-v3`)
3. Additive fields are backward-compatible and do NOT require a version bump
4. Removing or renaming fields IS a breaking change
5. The `schema_version` field in the event payload tracks the version

---

## Event Types

### 1. R17TelemetryV2Event

**Stream:** `r17-telemetry`
**Producers:** Edge Exporter, Simulator Worker
**Consumer:** Ingestion Service
**Schema:** `packages/schemas/src/telemetry/r17-telemetry-v2.ts` (Zod, LOCKED)

```typescript
interface R17TelemetryV2Event {
  schema_version: 'v2';
  asset_id: string;
  timestamp: string;  // ISO 8601
  source: {
    type: 'edge' | 'simulated' | 'replay';
    exporter_version: string;
    robot_id: string;
    firmware_version: string;
  };
  signals: {
    board_temperature_c: number | null;
    accel_magnitude_ms2: number | null;
    gyro_magnitude_rads: number | null;
    joint_position_error_deg: number | null;
    control_loop_freq_hz: number;
    control_loop_error_count: number;
    control_mode: 'enabled' | 'disabled' | 'gravity_compensation';
    error_code: string | null;
  };
}
```

### 2. IngestedEvent

**Stream:** `r17-ingested`
**Producer:** Ingestion Service
**Consumer:** Signal Agent
**Schema:** `packages/core-contracts/src/ingested-event.ts`

```typescript
interface IngestedEvent {
  event_id: string;          // UUID v4
  trace_id: string;          // OTel trace ID
  ingested_at: string;       // ISO 8601
  source_partition: string;  // Kinesis partition key
  source_sequence: string;   // Kinesis sequence number
  source_type: 'edge' | 'simulated' | 'replay';
  payload: R17TelemetryV2Event;
}
```

### 3. RiskEvent

**Stream:** `r17-risk-events`
**Producer:** Signal Agent
**Consumer:** Diagnosis Agent (Phase 3)
**Schema:** `packages/core-contracts/src/risk-event.ts`

```typescript
interface RiskEvent {
  event_id: string;          // UUID v4
  trace_id: string;          // propagated from IngestedEvent
  asset_id: string;
  timestamp: string;         // ISO 8601
  composite_risk: number;    // 0.0 - 1.0
  risk_state: 'nominal' | 'elevated' | 'critical';
  z_scores: {
    position_error_z: number;
    accel_z: number;
    gyro_z: number;
    temperature_z: number;
  };
  threshold_breach: number;  // 0.0, 0.5, or 1.0
  contributing_signals: string[];  // signals with |z| > 2.0
  last_values: {
    board_temperature_c: number;
    accel_magnitude_ms2: number;
    gyro_magnitude_rads: number;
    joint_position_error_deg: number;
    control_loop_freq_hz: number;
  };
}
```

### 4. DLQMessage

**Queue:** `r17-telemetry-dlq` (SQS)
**Producer:** Ingestion Service
**Consumer:** Manual inspection / alerting

```typescript
interface DLQMessage {
  error_code: string;
  error_message: string;
  error_details?: unknown;
  original_record: string;    // base64 of original Kinesis data
  source_stream: string;
  source_partition: string;
  source_sequence: string;
  failed_at: string;
  service: string;
}
```

### 5. DiagnosisEvent

**Stream:** `r17-diagnosis`
**Producer:** Diagnosis Agent
**Consumer:** Actions Agent
**Schema:** `packages/core-contracts/src/diagnosis-event.ts`

```typescript
interface DiagnosisEvent {
  event_id: string;          // UUID v4
  trace_id: string;          // propagated from RiskEvent
  asset_id: string;
  timestamp: string;         // ISO 8601
  risk_state: 'nominal' | 'elevated' | 'critical';
  composite_risk: number;    // 0.0 - 1.0, from RiskEvent
  root_cause: string;        // concise explanation from Bedrock
  evidence: Array<{
    signal: string;          // signal name
    observation: string;     // what this signal shows
    z_score: number;         // z-score value
  }>;
  confidence: 'low' | 'medium' | 'high';
  recommended_actions: string[];
  severity: 'info' | 'warning' | 'critical';
  model_id: string;          // Bedrock model used
  prompt_tokens: number;     // for cost tracking
  completion_tokens: number; // for cost tracking
}
```

### 6. ActionEvent

**Stream:** `r17-actions`
**Producer:** Actions Agent
**Consumer:** Conversation Agent (Phase 4)
**Schema:** `packages/core-contracts/src/action-event.ts`

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
  reason: string;                 // why this action was taken
  diagnosis_event_id: string;     // reference to triggering diagnosis
}
```

### 7. IncidentRecord

**Table:** `streaming-agents-incidents` (DynamoDB)
**Writer:** Actions Agent
**Reader:** Actions Agent, Conversation Agent (Phase 4)
**Schema:** `packages/core-contracts/src/incident-record.ts`

```typescript
interface IncidentRecord {
  incident_id: string;          // PK, UUID v4
  asset_id: string;             // GSI hash key
  status: 'opened' | 'escalated' | 'resolved';  // GSI range key
  opened_at: string;            // ISO 8601
  escalated_at: string | null;  // ISO 8601, set on escalation
  resolved_at: string | null;   // ISO 8601, set on resolution
  root_cause: string;           // from initial DiagnosisEvent
  severity: 'info' | 'warning' | 'critical';
  expires_at?: number;          // TTL epoch seconds (set on resolution)
}
```

---

## Partition Key Strategy

| Stream | Partition Key | Rationale |
|--------|--------------|-----------|
| `r17-telemetry` | `asset_id` | All readings for one robot go to same shard |
| `r17-ingested` | `asset_id` | Preserves ordering per robot |
| `r17-risk-events` | `asset_id` | Diagnosis agent needs ordered risk for each robot |
| `r17-diagnosis` | `asset_id` | Actions agent needs ordered diagnosis for each robot |
| `r17-actions` | `asset_id` | Conversation agent needs ordered actions for each robot |

---

## Schema Sync Workflow

When modifying schemas:

1. Update Zod schema in `packages/schemas/`
2. Run `pnpm generate:jsonschema` to regenerate JSON Schema
3. Update TypeScript types in `packages/core-contracts/`
4. Update JSON Schema in `contracts/kinesis/`
5. Update Pydantic models in `python/packages/streaming_agents_core/`
6. Bump `schema_version` if breaking
7. Update this document
