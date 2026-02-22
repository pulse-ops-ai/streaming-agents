# Telemetry Event Model

Each telemetry event represents a single measurement reading from an asset.

Prototype Asset: R-17 (Reachy-Mini)

---

## Schema: `r17.telemetry.v1`

Authoritative source: `packages/schemas/src/telemetry/r17-telemetry.ts` (Zod)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `schema_version` | string | `"r17.telemetry.v1"` (literal) | Fixed schema identifier |
| `event_id` | string | min 1 char (ULID or UUID) | Unique event identifier |
| `asset_id` | string | `"r-17"` (literal) | Asset identifier, locked for MVP |
| `timestamp` | string | ISO 8601 UTC | Measurement timestamp |
| `source` | enum | `"simulator"` \| `"reachy-daemon"` \| `"reachy-sdk"` \| `"replay"` | Origin of reading |
| `sequence` | integer | >= 0 | Monotonic counter per source |
| `sampling_hz` | number | > 0 | Sampling rate in Hz |
| `joint_3_torque_nm` | number | — | Servo torque in Newton-metres (proxy — see reachy-telemetry-mapping.md) |
| `joint_3_temperature_c` | number | — | Motor temperature in degrees Celsius |
| `motor_current_amp` | number | — | Motor current draw in Amps (proxy — see reachy-telemetry-mapping.md) |
| `joint_position_error_deg` | number | >= 0 | Absolute positional deviation in degrees |
| `error_code` | string \| null | default null | Rare discrete fault code |

Additional properties are **forbidden** (strict mode).

---

## Schema: `r17.risk_update.v1`

Authoritative source: `packages/schemas/src/telemetry/r17-risk-update.ts` (Zod)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `schema_version` | string | `"r17.risk_update.v1"` (literal) | Fixed schema identifier |
| `event_id` | string | min 1 char | Unique event identifier |
| `asset_id` | string | `"r-17"` (literal) | Asset identifier |
| `timestamp` | string | ISO 8601 UTC | Risk evaluation timestamp |
| `telemetry_event_id` | string | min 1 char | ID of the triggering telemetry event |
| `window_s` | integer | > 0 | Rolling window size in seconds |
| `risk_score` | number | [0, 1] | Composite risk score |
| `risk_state` | enum | `"nominal"` \| `"elevated"` \| `"critical"` | Categorical state |
| `anomaly_z` | object | (see below) | Per-signal z-scores |
| `weights` | object | fixed values | Weight vector for composite formula |

### `anomaly_z` object

| Field | Type | Description |
|-------|------|-------------|
| `joint_3_torque_nm` | number | Z-score for torque |
| `joint_3_temperature_c` | number | Z-score for temperature |
| `motor_current_amp` | number | Z-score for current |
| `joint_position_error_deg` | number | Z-score for position error |

### `weights` object (fixed)

| Field | Value | Description |
|-------|-------|-------------|
| `torque` | 0.4 | Torque anomaly weight |
| `temperature` | 0.3 | Temperature drift weight |
| `position_error` | 0.2 | Position error weight |
| `threshold_breach` | 0.1 | Threshold breach weight |

---

## Implementation Locations

| Language | Package | Path |
|----------|---------|------|
| TypeScript (Zod) | `@streaming-agents/schemas` | `packages/schemas/src/telemetry/` |
| JSON Schema | generated | `packages/schemas/generated/` |
| Python (Pydantic) | `streaming-agents-core` | `python/packages/streaming_agents_core/src/streaming_agents_core/telemetry.py` |

---

## Example Payloads

### Normal Operation

```json
{
  "schema_version": "r17.telemetry.v1",
  "event_id": "01JMR2N8X3KQZV7Y5B6WDTH4FG",
  "asset_id": "r-17",
  "timestamp": "2026-02-21T14:30:00.000Z",
  "source": "simulator",
  "sequence": 1042,
  "sampling_hz": 10,
  "joint_3_torque_nm": 0.82,
  "joint_3_temperature_c": 41.3,
  "motor_current_amp": 0.45,
  "joint_position_error_deg": 0.12,
  "error_code": null
}
```

Corresponding risk update (nominal):

```json
{
  "schema_version": "r17.risk_update.v1",
  "event_id": "01JMR2N9A7PQ4K8M3RVXCYH2JN",
  "asset_id": "r-17",
  "timestamp": "2026-02-21T14:30:00.050Z",
  "telemetry_event_id": "01JMR2N8X3KQZV7Y5B6WDTH4FG",
  "window_s": 300,
  "risk_score": 0.08,
  "risk_state": "nominal",
  "anomaly_z": {
    "joint_3_torque_nm": 0.3,
    "joint_3_temperature_c": 0.1,
    "motor_current_amp": 0.2,
    "joint_position_error_deg": 0.05
  },
  "weights": {
    "torque": 0.4,
    "temperature": 0.3,
    "position_error": 0.2,
    "threshold_breach": 0.1
  }
}
```

### Degradation (Gear Wear in Joint 3)

```json
{
  "schema_version": "r17.telemetry.v1",
  "event_id": "01JMR3P4W2HNYF9K8XTQB5AMRZ",
  "asset_id": "r-17",
  "timestamp": "2026-02-21T14:45:00.000Z",
  "source": "simulator",
  "sequence": 1942,
  "sampling_hz": 10,
  "joint_3_torque_nm": 1.74,
  "joint_3_temperature_c": 58.6,
  "motor_current_amp": 0.91,
  "joint_position_error_deg": 2.35,
  "error_code": null
}
```

Corresponding risk update (critical):

```json
{
  "schema_version": "r17.risk_update.v1",
  "event_id": "01JMR3P5B8VQKM2N7WYDJC4XRE",
  "asset_id": "r-17",
  "timestamp": "2026-02-21T14:45:00.050Z",
  "telemetry_event_id": "01JMR3P4W2HNYF9K8XTQB5AMRZ",
  "window_s": 300,
  "risk_score": 0.87,
  "risk_state": "critical",
  "anomaly_z": {
    "joint_3_torque_nm": 3.2,
    "joint_3_temperature_c": 2.8,
    "motor_current_amp": 2.1,
    "joint_position_error_deg": 4.5
  },
  "weights": {
    "torque": 0.4,
    "temperature": 0.3,
    "position_error": 0.2,
    "threshold_breach": 0.1
  }
}
```

---

## Risk Scoring Inputs

Risk is calculated using:

- Z-score deviation from rolling baseline per signal
- Weighted composite formula (see risk-scoring.md)
- Threshold breach detection

---

## Design Principles

- Risk scoring must be deterministic
- Risk scoring must be explainable
- Risk scoring must be repeatable for demo scenarios
- LLM must not generate or modify risk logic
- See `reachy-telemetry-mapping.md` for hardware field mapping details
