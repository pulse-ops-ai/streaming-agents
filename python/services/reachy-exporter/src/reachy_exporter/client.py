"""Async HTTP client for the Reachy-Mini daemon REST API."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from reachy_exporter.config import REACHY_DAEMON_URL

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class JointState:
    """Parsed joint state from /api/state/full."""

    head_joints: list[float]
    target_head_joints: list[float] | None


@dataclass(frozen=True)
class DaemonStatus:
    """Parsed daemon status from /api/daemon/status."""

    control_mode: str | None
    control_loop_freq_hz: float | None
    control_loop_max_interval_ms: float | None
    control_loop_error_count: int | None
    error_code: str | None


async def fetch_joint_state(client: httpx.AsyncClient) -> JointState:
    """Fetch present and target joint positions from the daemon."""
    resp = await client.get(
        f"{REACHY_DAEMON_URL}/api/state/full",
        params={"with_head_joints": "true", "with_target_head_joints": "true"},
    )
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()

    head_joints = data.get("head_joints", [])
    target_head_joints = data.get("target_head_joints")

    return JointState(
        head_joints=head_joints,
        target_head_joints=target_head_joints,
    )


async def fetch_daemon_status(client: httpx.AsyncClient) -> DaemonStatus:
    """Fetch daemon status including control loop stats."""
    resp = await client.get(f"{REACHY_DAEMON_URL}/api/daemon/status")
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()

    backend = data.get("backend_status", {})
    loop_stats = backend.get("control_loop_stats", {})
    error_code = data.get("error")

    control_mode: str | None = None
    for key in ("control_mode", "mode"):
        if key in data:
            control_mode = str(data[key])
            break

    return DaemonStatus(
        control_mode=control_mode,
        control_loop_freq_hz=loop_stats.get("mean_control_loop_frequency"),
        control_loop_max_interval_ms=_to_ms(loop_stats.get("max_control_loop_interval")),
        control_loop_error_count=loop_stats.get("nb_error"),
        error_code=str(error_code) if error_code else None,
    )


def _to_ms(seconds: float | None) -> float | None:
    return seconds * 1000.0 if seconds is not None else None
