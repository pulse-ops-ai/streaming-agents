# Reachy Mini — SDK & API Reference for Edge Exporter

This document is the authoritative reference for AI agents building
the R-17 edge exporter. All field names, units, and access patterns
are confirmed against a real Wireless Reachy Mini running firmware 1.3.1.

---

## Hardware Profile

- Model: Reachy Mini (Wireless)
- Compute: Raspberry Pi 5
- Daemon: FastAPI on port 8000 (REST + WebSocket)
- SDK: `reachy_mini` Python package (installed in `/venvs/mini_daemon/`)
- Firmware: 1.3.1
- Control loop: ~50 Hz
- Servos: 9 motors — `body_rotation`, `stewart_1`–`stewart_6`, `right_antenna`, `left_antenna`
- Head mechanism: 6-DoF Stewart platform (6 linear actuators)
- Sensors: IMU (accelerometer, gyroscope, temperature), 4-mic array, wide-angle camera

---

## Access Patterns

### REST API (preferred for edge exporter)

Base URL: `http://<robot-ip>:8000`

#### Full State (primary telemetry source)

```
GET /api/state/full?with_head_joints=true&with_target_head_joints=true&with_doa=true
```

Response:
```json
{
  "control_mode": "enabled",
  "head_pose": {
    "x": -0.0014, "y": 0.0034, "z": -0.0023,
    "roll": 0.0728, "pitch": 0.0042, "yaw": -0.0509
  },
  "head_joints": [
    -0.0015, 0.6213, -0.6013, 0.5369, -0.6182, 0.5292, -0.5553
  ],
  "body_yaw": -0.0015,
  "antennas_position": [0.0031, -0.0015],
  "timestamp": "2026-02-22T02:40:38.444567Z",
  "passive_joints": null,
  "doa": {
    "angle": 1.7802,
    "speech_detected": false
  }
}
```

Field reference:
- `head_joints`: Array of 7 floats (radians). Index 0 = body_rotation, 1–6 = stewart actuators
- `head_pose`: Cartesian pose. x/y/z in meters, roll/pitch/yaw in radians
- `body_yaw`: Body rotation in radians
- `antennas_position`: [left, right] in radians
- `doa`: Direction of Arrival from mic array. angle in radians (0=left, π/2=front, π=right)
- `timestamp`: ISO 8601 UTC

Note: `target_head_joints` and `target_head_pose` only appear when a goto command
is actively executing. They are null/absent at rest.

#### Daemon Status (system health source)

```
GET /api/daemon/status
```

Response:
```json
{
  "robot_name": "reachy_mini",
  "state": "running",
  "wireless_version": true,
  "backend_status": {
    "ready": false,
    "motor_control_mode": "enabled",
    "last_alive": null,
    "control_loop_stats": {
      "mean_control_loop_frequency": 49.60,
      "max_control_loop_interval": 0.02026,
      "nb_error": 0,
      "motor_controller": "ControlLoopStats(period=~19.99ms, read_dt=~1.92 ms, write_dt=~0.08 ms)"
    },
    "error": null
  },
  "error": null,
  "wlan_ip": "10.0.20.204",
  "version": "1.3.1"
}
```

Field reference:
- `mean_control_loop_frequency`: Hz (nominal ~50)
- `max_control_loop_interval`: seconds (convert to ms: * 1000)
- `nb_error`: cumulative motor communication error count
- `motor_controller`: debug string, do NOT parse programmatically
- `error`: string or null, top-level daemon error
- `backend_status.error`: string or null, backend-specific error

#### Motor Status

```
GET /api/motors/status
```

Response:
```json
{
  "mode": "enabled"
}
```

Values: `enabled`, `disabled`, `gravity_compensation`

#### Other Useful Endpoints

- `GET /api/state/present_head_pose` — head pose only
- `GET /api/state/present_body_yaw` — body yaw only (radians)
- `GET /api/state/present_antenna_joint_positions` — [left, right] (radians)
- `GET /api/state/doa` — Direction of Arrival or null
- `POST /health-check` — daemon health check

### WebSocket (alternative for higher frequency)

```
ws://<robot-ip>:8000/api/state/ws/full
```

Streams full state at ~10 Hz. Same payload as REST full state.
Use for real-time monitoring. REST polling at 2 Hz is sufficient for PdM.

### Python SDK (for IMU data)

The IMU is only accessible via the Python SDK, not REST.

```python
from reachy_mini import ReachyMini

with ReachyMini() as mini:
    imu = mini.imu
```

IMU response:
```json
{
  "accelerometer": [0.191, 0.746, 9.641],
  "gyroscope": [0.00453, -0.000266, 0.000799],
  "quaternion": [0.251, 0.0186, 0.0363, 0.967],
  "temperature": 43.5
}
```

Field reference:
- `accelerometer`: [x, y, z] in m/s² (includes gravity ~9.8 on z-axis at rest)
- `gyroscope`: [x, y, z] in rad/s (near-zero at rest)
- `quaternion`: [w, x, y, z] orientation
- `temperature`: °C (board-level, not per-motor)

Python path on robot: `/venvs/mini_daemon/bin/python`

---

## What Reachy Mini Does NOT Expose

These fields do NOT exist on Reachy Mini (they exist on larger Reachy 2021/2023):

- Per-motor torque / present_load
- Per-motor current / present_current
- Per-motor temperature
- Per-motor hardware_error_status bitfield
- Named joint accessors like `joints["r_shoulder_roll"]`
- Battery level (known hardware limitation)

Do not attempt to read these. The edge exporter must only use signals
documented in this file.

---

## Robot Network Access

- SSH: `ssh pollen@reachy-mini.local` (password: `checkdocumentation`)  <!-- pragma: allowlist secret -->
- Daemon: `http://reachy-mini.local:8000`
- Python env: `/venvs/mini_daemon/bin/python`
- Daemon service: `sudo systemctl [start|stop|restart] reachy-mini-daemon`
- Daemon logs: `journalctl -u reachy-mini-daemon -f`

---

## Edge Exporter Design Constraints

1. Exporter runs ON the RPi alongside the daemon
2. Poll REST API at ~2 Hz (do not exceed 5 Hz)
3. IMU requires SDK connection (one ReachyMini context)
4. SDK connection may conflict with daemon — test carefully
5. Prefer REST over SDK where possible to avoid contention
6. Publish directly to Kinesis (via boto3 PutRecord)
7. All timestamps must be ISO 8601 UTC
