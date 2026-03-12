# Reachy Exporter — Deployment & Operations

The reachy-exporter is a Python service that runs on the Reachy Mini's Raspberry Pi. It polls the robot's REST API every 2 seconds and publishes telemetry to Amazon Kinesis.

## Architecture

```
Reachy Mini Daemon (port 8000)
  └── REST API: /api/state/full, /api/daemon/status
        │
        ▼
  reachy-exporter (systemd service)
        │
        ▼
  Amazon Kinesis → Ingestion Lambda → Signal Agent → DynamoDB
```

The exporter runs as a standalone systemd service alongside the daemon. It does NOT use the SDK's `ReachyMiniApp` pattern — it's a background sidecar, not an interactive app.

## Deployment

### Prerequisites

- SSH access to the robot: `ssh pollen@reachy-mini.local`
- AWS credentials configured on the Pi (via `aws configure` or environment variables)
- Python 3.12+ with uv

### Install / Update

Deploy code changes from your development machine using the Taskfile:

```bash
task deploy:exporter
```

This copies the `reachy_exporter/` source to the Pi and restarts the systemd service automatically. No need to SSH in manually.

For the initial setup on the Pi (first time only):

```bash
# On the robot
cd /home/pollen/streaming-agents
uv sync
```

### Systemd Service

The exporter runs as `reachy-exporter.service`:

```ini
# /etc/systemd/system/reachy-exporter.service
[Unit]
Description=Reachy Telemetry Exporter
After=network-online.target reachy-mini.service
Wants=network-online.target

[Service]
Type=simple
User=pollen
WorkingDirectory=/home/pollen/streaming-agents
ExecStart=/home/pollen/streaming-agents/.venv/bin/python -m reachy_exporter.main
Restart=on-failure
RestartSec=5
Environment=ASSET_ID=R-17
Environment=KINESIS_STREAM_NAME=streaming-agents-r17-telemetry
Environment=AWS_REGION=us-east-1
Environment=IMU_ENABLED=false

[Install]
WantedBy=multi-user.target
```

### Start / Stop / Restart

```bash
# Start the exporter
sudo systemctl start reachy-exporter

# Stop the exporter
sudo systemctl stop reachy-exporter

# Restart after code update
sudo systemctl restart reachy-exporter

# Enable on boot
sudo systemctl enable reachy-exporter

# Disable on boot
sudo systemctl disable reachy-exporter
```

## Configuration

All configuration is via environment variables (set in the systemd unit or shell):

| Variable | Default | Description |
|----------|---------|-------------|
| `REACHY_DAEMON_URL` | `http://localhost:8000` | Daemon REST API base URL |
| `SAMPLING_HZ` | `2` | Telemetry sampling rate (Hz) |
| `KINESIS_STREAM_NAME` | `streaming-agents-r17-telemetry` | Target Kinesis stream |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ENDPOINT_URL` | (none) | Override for LocalStack or custom endpoint |
| `IMU_ENABLED` | `true` | Enable IMU reading via SDK (requires `reachy_mini` package) |
| `ASSET_ID` | `R-17` | Robot identifier (must match pipeline expectations) |

### AWS Credentials

The exporter uses the default boto3 credential chain. On the Pi, configure via:

```bash
aws configure
# Or set environment variables in the systemd unit:
# Environment=AWS_ACCESS_KEY_ID=...
# Environment=AWS_SECRET_ACCESS_KEY=...
```

## Checking Logs

```bash
# Follow logs in real time
journalctl -u reachy-exporter -f

# Last 50 lines
journalctl -u reachy-exporter -n 50

# Since last boot
journalctl -u reachy-exporter -b

# Filter for errors only
journalctl -u reachy-exporter -p err
```

### Healthy Output

```
[INFO] Connected to Kinesis stream streaming-agents-r17-telemetry in us-east-1
[DEBUG] Published event 01JXXXX...
[DEBUG] Published event 01JXXXX...
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ConnectionRefusedError` | Daemon not running | `sudo systemctl start reachy-mini` |
| `NoCredentialsError` | AWS creds not configured | Run `aws configure` on the Pi |
| `ResourceNotFoundException` | Kinesis stream doesn't exist | Check stream name and region |
| `Failed to connect to Reachy-Mini IMU` | SDK not installed or daemon busy | Set `IMU_ENABLED=false` |

## Dry-Run Mode

Test locally without publishing to Kinesis:

```bash
python -m reachy_exporter.main --dry-run
```

Events print to stdout as JSON. Useful for verifying the daemon connection and telemetry format.

## Verifying End-to-End

1. Start the exporter: `sudo systemctl start reachy-exporter`
2. Check logs: `journalctl -u reachy-exporter -f`
3. Verify Kinesis records arriving (from your laptop):
   ```bash
   aws kinesis get-shard-iterator \
     --stream-name streaming-agents-r17-telemetry \
     --shard-id shardId-000000000000 \
     --shard-iterator-type LATEST \
     --query ShardIterator --output text
   ```
4. Check DynamoDB for asset state:
   ```bash
   aws dynamodb get-item \
     --table-name streaming-agents-asset-state \
     --key '{"asset_id": {"S": "R-17"}}'
   ```
5. Check the Grafana dashboard for incoming telemetry metrics

## See Also

- [Telemetry Mapping](../../02-domain/reachy-telemetry-mapping.md) — daemon/SDK fields → telemetry v2 schema, derived metrics formulas
- [Reachy Mini SDK Reference](../../05-dev/reachy-mini-sdk-reference.md) — REST API endpoints, IMU access, hardware profile
- [Reachy Voice](../reachy-voice/) — voice copilot running alongside the exporter
