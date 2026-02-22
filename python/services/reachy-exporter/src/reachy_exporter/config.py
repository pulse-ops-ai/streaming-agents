"""Environment-based configuration for reachy-exporter."""

from __future__ import annotations

import os

# Daemon REST API
REACHY_DAEMON_URL: str = os.environ.get("REACHY_DAEMON_URL", "http://localhost:8000")

# Sampling
SAMPLING_HZ: float = float(os.environ.get("SAMPLING_HZ", "2"))

# Kinesis
KINESIS_STREAM_NAME: str = os.environ.get("KINESIS_STREAM_NAME", "r17-telemetry-v2")
AWS_REGION: str = os.environ.get("AWS_REGION", "us-east-1")
AWS_ENDPOINT_URL: str | None = os.environ.get("AWS_ENDPOINT_URL")

# IMU
IMU_ENABLED: bool = os.environ.get("IMU_ENABLED", "true").lower() in ("true", "1", "yes")

# Joint index for position error calculation (0-based, neck_yaw / head joint)
J3_INDEX: int = 2
