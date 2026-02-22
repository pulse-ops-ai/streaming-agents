# Service Contract: Edge Exporter

## Identity
- **Service:** `reachy-exporter`
- **Location:** `python/services/reachy-exporter/`
- **Runtime:** Python 3.11 on Raspberry Pi 5 (Reachy Mini)
- **Trigger:** Internal polling loop (2 Hz)
- **Phase:** 2.1 (SCAFFOLDED — implementation in parallel with simulator)

## Purpose

Reads real sensor data from the Reachy Mini robot and publishes normalized
`R17TelemetryV2Event` events to the `r17-telemetry` Kinesis stream.

This is the **real hardware** producer. The simulator generates synthetic data;
the edge exporter generates real data. Both write to the same stream.

## What It Receives

Nothing from Kinesis. It reads from:
1. Reachy Mini REST API (`http://localhost:8000`)
2. Reachy Mini SDK (for IMU data via `/venvs/mini_daemon/bin/python`)

## What It Does

Every 500ms (2 Hz):

1. **Read REST API** — GET `/v1/audit/state` for joint positions, control mode, errors
2. **Read REST API** — GET `/v1/audit/stats` for control loop frequency, error count
3. **Read IMU** (optional, graceful fallback) — accelerometer, gyroscope, temperature
4. **Compute derived signals**:
   - `accel_magnitude_ms2` = sqrt(ax² + ay² + az²)
   - `gyro_magnitude_rads` = sqrt(gx² + gy² + gz²)
   - `joint_position_error_deg` = abs(target[J3] - actual[J3]) × 180/π
     - J3 = index 3 in head joints array (first Stewart platform actuator)
     - If target not available, use delta from previous reading
5. **Construct R17TelemetryV2Event** with `source.type = "edge"`
6. **Publish to Kinesis** (partition key: `R-17`)

## What It Emits

`R17TelemetryV2Event` to Kinesis stream `r17-telemetry`.

Source field:
```json
{
  "type": "edge",
  "exporter_version": "1.0.0",
  "robot_id": "R-17",
  "firmware_version": "1.3.1"
}
```

## What It Must NOT Do

- Must NOT crash the robot daemon
- Must NOT send commands to the robot (read-only)
- Must NOT block on Kinesis failures (fire-and-forget with local buffer)
- Must NOT require IMU — graceful fallback with null values if SDK unavailable

## Hardware Constraints

See `docs/ai/reachy-mini-sdk-reference.md` for complete API reference.

Key points:
- REST API: `http://reachy-mini.local:8000`
- IMU requires SDK: `/venvs/mini_daemon/bin/python`
- J3_INDEX = 3 (first Stewart platform actuator in head joints array)
- Head joints array: 7 values [body_rotation, j0..j5] in radians
- No per-motor torque/current/temperature available

## Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REACHY_HOST` | no | `localhost` | Robot daemon host |
| `REACHY_PORT` | no | `8000` | Robot daemon port |
| `KINESIS_STREAM_NAME` | yes | — | Target Kinesis stream |
| `AWS_REGION` | yes | — | AWS region |
| `ASSET_ID` | no | `R-17` | Asset identifier |
| `SAMPLE_RATE_HZ` | no | `2` | Sampling frequency |
| `DRY_RUN` | no | `false` | Print events instead of publishing |
| `ENABLE_IMU` | no | `true` | Attempt IMU reads |

## Existing Scaffolding

Already created in Phase 2.1:
- `config.py` — env var config + J3_INDEX constant
- `client.py` — async httpx client for daemon REST API
- `imu.py` — optional IMU reader with graceful fallback
- `publisher.py` — Kinesis publisher with dry-run mode
- `main.py` — CLI entry point (--dry-run, --once, --log-level)
