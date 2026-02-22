"""r17.telemetry.v1 and r17.risk_update.v1 — Pydantic models.

These models mirror the authoritative Zod schemas in
packages/schemas/src/telemetry/.  Any structural change must start in the
Zod source and be ported here.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

# ── Telemetry Event ──────────────────────────────────────────────


class TelemetrySource(StrEnum):
    """Origin of a telemetry reading."""

    simulator = "simulator"
    reachy_daemon = "reachy-daemon"
    reachy_sdk = "reachy-sdk"
    replay = "replay"


class R17TelemetryEvent(BaseModel, extra="forbid"):
    """Canonical telemetry event for Robotic Unit R-17 (Reachy-Mini)."""

    schema_version: Literal["r17.telemetry.v1"]
    event_id: str = Field(min_length=1)
    asset_id: Literal["r-17"]
    timestamp: str = Field(description="ISO 8601 UTC timestamp")
    source: TelemetrySource
    sequence: int = Field(ge=0)
    sampling_hz: float = Field(gt=0)

    # Signals
    joint_3_torque_nm: float
    joint_3_temperature_c: float
    motor_current_amp: float
    joint_position_error_deg: float = Field(ge=0)
    error_code: str | None = None


# ── Risk Update ──────────────────────────────────────────────────


class RiskState(StrEnum):
    """Categorical risk state derived from composite risk score."""

    nominal = "nominal"
    elevated = "elevated"
    critical = "critical"


class AnomalyZScores(BaseModel, extra="forbid"):
    """Per-signal z-score breakdown."""

    joint_3_torque_nm: float
    joint_3_temperature_c: float
    motor_current_amp: float
    joint_position_error_deg: float


class RiskWeights(BaseModel, extra="forbid"):
    """Fixed weight vector for the composite risk formula."""

    torque: Literal[0.4] = 0.4
    temperature: Literal[0.3] = 0.3
    position_error: Literal[0.2] = 0.2
    threshold_breach: Literal[0.1] = 0.1


class R17RiskUpdate(BaseModel, extra="forbid"):
    """Risk update event emitted by the Signal Agent."""

    schema_version: Literal["r17.risk_update.v1"]
    event_id: str = Field(min_length=1)
    asset_id: Literal["r-17"]
    timestamp: str = Field(description="ISO 8601 UTC timestamp")
    telemetry_event_id: str = Field(min_length=1)
    window_s: int = Field(gt=0)
    risk_score: float = Field(ge=0, le=1)
    risk_state: RiskState
    anomaly_z: AnomalyZScores
    weights: RiskWeights = Field(default_factory=RiskWeights)
