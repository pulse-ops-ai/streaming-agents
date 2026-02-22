# Reachy Exporter

Edge telemetry exporter that polls the Reachy-Mini daemon REST API and IMU,
then publishes `r17.telemetry.v2` events to Kinesis (or stdout in dry-run mode).

## Quick Start

```bash
cd python
uv sync

# Dry-run (prints JSON to stdout, no Kinesis)
uv run reachy-exporter --dry-run --once

# Continuous polling (requires daemon at REACHY_DAEMON_URL)
uv run reachy-exporter --dry-run
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REACHY_DAEMON_URL` | `http://localhost:8000` | Daemon REST API base URL |
| `SAMPLING_HZ` | `2` | Polling rate in Hz |
| `KINESIS_STREAM_NAME` | `r17-telemetry-v2` | Kinesis stream name |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ENDPOINT_URL` | — | LocalStack endpoint override |
| `AWS_PROFILE` | — | AWS credentials profile |
| `IMU_ENABLED` | `true` | Enable IMU reads (requires `reachy-mini` package) |

## CLI Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Print JSON to stdout instead of publishing to Kinesis |
| `--once` | Emit one sample and exit |
| `--log-level` | Set log level: DEBUG, INFO, WARNING, ERROR (default: INFO) |

## Architecture

```
main.py (asyncio loop)
  +-- client.py -> GET /api/state/full (present + target joints, control_mode)
  |             -> GET /api/daemon/status (control_loop_stats, error)
  +-- imu.py   -> mini.imu["accelerometer"], mini.imu["gyroscope"], mini.imu["temperature"]
  +-- publisher.py -> Kinesis put_record (or stdout in dry-run)
```
