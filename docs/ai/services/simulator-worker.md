# Service Contract: Simulator Worker

## Identity
- **Service:** `simulator-worker`
- **Location:** `apps/lambdas/simulator-worker/`
- **Runtime:** NestJS on AWS Lambda
- **Trigger:** Asynchronous invocation from simulator-controller
- **Phase:** 2.5

## Purpose

Generates synthetic R17 telemetry events for a single asset and publishes them
to the `r17-telemetry` Kinesis stream. Each invocation simulates one robot
for one minute (120 events at 2 Hz). Scenarios control degradation patterns
so demos are repeatable and deterministic.

## What It Receives

`SimulatorWorkerPayload` from the controller:

```typescript
interface SimulatorWorkerPayload {
  asset_id: string;         // e.g., "R-17"
  scenario: ScenarioName;   // e.g., "joint_3_degradation"
  seed: string;             // deterministic seed for reproducibility
  burst_count: number;      // events to generate (default 120)
}
```

## What It Does

1. Initializes a seeded PRNG from `seed`
2. Loads the scenario configuration
3. For each tick (0 to burst_count - 1):
   a. Computes elapsed time: `tick * 500ms` (2 Hz)
   b. Generates base signals using scenario baseline + Gaussian noise (seeded)
   c. Applies scenario degradation curve to affected signals
   d. Constructs a complete `R17TelemetryV2Event`
   e. Publishes to Kinesis `r17-telemetry` stream (partition key: `asset_id`)
4. Logs summary: events_sent, scenario, asset_id, duration_ms

## What It Emits

`R17TelemetryV2Event` to Kinesis stream `r17-telemetry`.

Every event MUST conform to the v2 schema defined in `packages/schemas/src/telemetry/r17-telemetry-v2.ts`.

The `source` field MUST be set to:
```json
{
  "type": "simulated",
  "exporter_version": "1.0.0",
  "robot_id": "<asset_id>",
  "firmware_version": "sim-1.0"
}
```

## What It Must NOT Do

- Must NOT read from Kinesis or any downstream service
- Must NOT write to DynamoDB
- Must NOT call the ingestion service directly (only through Kinesis)
- Must NOT use `Math.random()` — all randomness from seeded PRNG
- Must NOT exceed Lambda timeout (set to 90 seconds)

## Scenarios (LOCKED)

### `healthy`
All signals within normal operating range. No degradation.
- board_temperature_c: 38 ± 2°C
- accel_magnitude_ms2: 9.81 ± 0.3 m/s²
- gyro_magnitude_rads: 0.02 ± 0.01 rad/s
- joint_position_error_deg: 0.1 ± 0.05°
- control_loop_freq_hz: 49.5 ± 0.5 Hz

### `joint_3_degradation`
Actuator 3 gradually fails. Position error increases linearly over 60 seconds.
- joint_position_error_deg: starts 0.1°, reaches 3.5° by tick 120
- board_temperature_c: starts 38°C, reaches 52°C by tick 120
- Other signals: normal + slight sympathetic noise increase

### `thermal_runaway`
Board temperature spikes rapidly after tick 60.
- board_temperature_c: stable at 40°C for ticks 0-60, then +0.5°C/tick to 70°C
- control_loop_freq_hz: starts dropping after tick 80 (thermal throttling)
- Other signals: normal until temperature exceeds 55°C, then noise increases

### `vibration_anomaly`
Accelerometer shows increasing mechanical looseness.
- accel_magnitude_ms2: starts 9.81, increases to 15.0 by tick 120
- gyro_magnitude_rads: sympathetic increase from 0.02 to 0.15
- joint_position_error_deg: slight increase from 0.1 to 0.8
- board_temperature_c: normal

### `mixed`
Controller assigns scenarios round-robin across the fleet:
- 60% healthy
- 15% joint_3_degradation
- 10% thermal_runaway
- 10% vibration_anomaly
- 5% random walk (Gaussian drift on all signals)

## Deterministic Seeding

```typescript
// Same seed + same scenario = identical output, always
const prng = seedrandom(payload.seed);

function gaussianNoise(mean: number, stddev: number): number {
  // Box-Muller transform using seeded PRNG
  const u1 = prng();
  const u2 = prng();
  return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
```

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KINESIS_STREAM_NAME` | yes | — | Target Kinesis stream |
| `AWS_REGION` | yes | — | AWS region |
| `OTEL_SERVICE_NAME` | no | `simulator-worker` | OTel service name |
| `BATCH_SIZE` | no | `25` | Kinesis PutRecords batch size |

## Dependencies

- `@streaming-agents/schemas` — R17TelemetryV2Event Zod schema
- `@streaming-agents/core-contracts` — event envelope
- `@streaming-agents/core-config` — validated env config
- `@streaming-agents/core-telemetry` — OTel instrumentation
- `@streaming-agents/core-kinesis` — Kinesis producer
- `@streaming-agents/lambda-base` — BaseLambdaHandler
- `seedrandom` — deterministic PRNG

## OTel Instrumentation

- Span: `simulator.worker.generate` with attributes:
  - `simulator.asset_id`: asset being simulated
  - `simulator.scenario`: scenario name
  - `simulator.events_generated`: count
- Metric: `simulator.worker.events_produced` (counter, tags: scenario, asset_id)
- Metric: `simulator.worker.kinesis_put_latency_ms` (histogram)
- Metric: `simulator.worker.errors` (counter, tags: error_type)
