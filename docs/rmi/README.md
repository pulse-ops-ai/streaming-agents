# RMI — Reachy Mini Integration

Reference materials and deployment guides for the Reachy Mini robot integration.

## Deployment Guides

| Guide | Description |
|-------|-------------|
| [reachy-exporter/](reachy-exporter/) | Telemetry exporter — deployment, configuration, systemd management, log checking |
| [reachy-voice/](reachy-voice/) | Voice copilot — deployment, VAD tuning, audio pipeline, troubleshooting |

## Deploying to the Robot

Use the Taskfile tasks from your development machine:

```bash
# Deploy both services
task deploy:pi

# Or individually
task deploy:exporter        # copies src + restarts systemd service
task deploy:voice           # copies src + pip install (with deps)
task deploy:voice:update    # copies src + pip install (code only, faster)
```

See each service's README for details.

## Reference

| File | Description |
|------|-------------|
| `reachy-openapi.json` | OpenAPI 3.1.0 spec for the Reachy Mini daemon REST API (port 8000) |
| [Telemetry Mapping](../02-domain/reachy-telemetry-mapping.md) | Daemon/SDK fields → telemetry v2 schema, derived metrics |
| [SDK Reference](../05-dev/reachy-mini-sdk-reference.md) | REST API endpoints, IMU access, hardware profile, network |

## Robot Details

- **Model:** Reachy Mini (wireless variant)
- **Compute:** Raspberry Pi 5 / CM4, 3.7GB RAM
- **Daemon:** FastAPI on port 8000, WebSocket SDK on `/ws/sdk`
- **OS:** Raspberry Pi OS (Debian-based), Python 3.12+
- **Network:** `reachy-mini.local` (mDNS), SSH as `pollen@reachy-mini.local`

## Services Running on Robot

| Service | Type | Purpose |
|---------|------|---------|
| `reachy-mini` (daemon) | systemd | Core robot control — motors, sensors, API |
| `reachy-exporter` | systemd | Telemetry → Kinesis (2 Hz polling) |
| `reachy-voice` | daemon app | Voice copilot (mic → Lex → Polly → speaker) |

## Quick Commands

```bash
# SSH to robot
ssh pollen@reachy-mini.local

# Check all services
systemctl status reachy-mini reachy-exporter

# Exporter logs
journalctl -u reachy-exporter -f

# Voice / daemon logs
journalctl -u reachy-mini -f

# Stop telemetry export
sudo systemctl stop reachy-exporter

# Restart everything
sudo systemctl restart reachy-mini reachy-exporter
```
