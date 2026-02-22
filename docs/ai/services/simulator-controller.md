# Service Contract: Simulator Controller

## Identity
- **Service:** `simulator-controller`
- **Location:** `apps/lambdas/simulator-controller/`
- **Runtime:** NestJS on AWS Lambda
- **Trigger:** Amazon EventBridge rule (rate: 1 minute)
- **Phase:** 2.5

## Purpose

Orchestrates the simulator fleet. Every minute, EventBridge invokes this Lambda.
It reads a load schedule configuration, determines how many worker Lambdas (N)
to invoke for the current time window, then asynchronously invokes N
`simulator-worker` Lambdas.

## What It Receives

EventBridge scheduled event (cron payload — content is irrelevant, only the trigger matters).

## What It Does

1. Reads the current UTC hour
2. Looks up N from the load schedule (see below)
3. For each of N workers, constructs a `SimulatorWorkerPayload`:
   - `asset_id`: deterministic — `R-{workerIndex + 1}` (e.g., R-1 through R-50)
   - `scenario`: selected from scenario rotation or explicit config
   - `seed`: deterministic — `{date_string}:{asset_id}:{invocation_count}`
   - `burst_count`: number of events to emit (default: 120 = 2 Hz × 60 seconds)
4. Invokes each worker Lambda asynchronously (`InvocationType: Event`)
5. Logs invocation count and scenario distribution

## What It Emits

Nothing to Kinesis. It only invokes worker Lambdas via `lambda:InvokeFunction`.

## What It Must NOT Do

- Must NOT generate telemetry events itself
- Must NOT write to Kinesis
- Must NOT block on worker completion (fire-and-forget)
- Must NOT exceed Lambda timeout (set to 30 seconds)

## Load Schedule

```typescript
// Variable load: simulate peak hours vs. nightly lulls
// All times UTC
const LOAD_SCHEDULE: Record<number, number> = {
  0: 5,    // midnight: skeleton crew
  1: 5,
  2: 5,
  3: 5,
  4: 10,   // early morning ramp
  5: 15,
  6: 25,
  7: 35,
  8: 50,   // peak shift
  9: 50,
  10: 50,
  11: 50,
  12: 40,  // lunch lull
  13: 50,
  14: 50,
  15: 50,
  16: 45,  // afternoon wind-down
  17: 35,
  18: 25,
  19: 15,
  20: 10,
  21: 10,
  22: 5,
  23: 5,
};
```

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKER_FUNCTION_NAME` | yes | — | ARN or name of simulator-worker Lambda |
| `LOAD_SCHEDULE_JSON` | no | built-in | Override load schedule as JSON |
| `DEFAULT_SCENARIO` | no | `mixed` | Default scenario for workers |
| `AWS_REGION` | yes | — | AWS region for Lambda client |
| `OTEL_SERVICE_NAME` | no | `simulator-controller` | OTel service name |

## Dependencies

- `@streaming-agents/core-config` — validated env config
- `@streaming-agents/core-telemetry` — OTel instrumentation
- `@streaming-agents/lambda-base` — BaseLambdaHandler
- `@aws-sdk/client-lambda` — invoke workers

## OTel Instrumentation

- Span: `simulator.controller.invoke` with attributes:
  - `simulator.hour`: current UTC hour
  - `simulator.worker_count`: N
  - `simulator.scenario_distribution`: JSON of scenario counts
- Metric: `simulator.controller.invocations` (counter, tags: hour, worker_count)
- Metric: `simulator.controller.errors` (counter, tags: error_type)
