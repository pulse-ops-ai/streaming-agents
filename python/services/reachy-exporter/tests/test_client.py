"""Tests for reachy_exporter.client."""

import httpx
import pytest
import respx

from reachy_exporter.client import (
    DaemonStatus,
    JointState,
    _to_ms,
    fetch_daemon_status,
    fetch_joint_state,
)

FULL_STATE_RESPONSE = {
    "control_mode": "enabled",
    "head_pose": {"x": 0.0, "y": 0.0, "z": 0.0, "roll": 0.0, "pitch": 0.0, "yaw": 0.0},
    "head_joints": [-0.0015, 0.6213, -0.6013, 0.5369, -0.6182, 0.5292, -0.5553],
    "body_yaw": -0.0015,
    "antennas_position": [0.0031, -0.0015],
    "timestamp": "2026-02-22T02:40:38.444567Z",
    "target_head_joints": [0.0, 0.62, -0.60, 0.54, -0.62, 0.53, -0.55],
}

DAEMON_STATUS_RESPONSE = {
    "robot_name": "reachy_mini",
    "state": "running",
    "wireless_version": True,
    "backend_status": {
        "ready": False,
        "motor_control_mode": "enabled",
        "last_alive": None,
        "control_loop_stats": {
            "mean_control_loop_frequency": 49.60,
            "max_control_loop_interval": 0.02026,
            "nb_error": 0,
        },
        "error": None,
    },
    "error": None,
    "wlan_ip": "10.0.20.204",
    "version": "1.3.1",
}


@pytest.mark.asyncio
async def test_fetch_joint_state():
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.get("http://localhost:8000/api/state/full").mock(
                return_value=httpx.Response(200, json=FULL_STATE_RESPONSE)
            )
            result = await fetch_joint_state(client)

    assert isinstance(result, JointState)
    assert len(result.head_joints) == 7
    assert result.target_head_joints is not None
    assert len(result.target_head_joints) == 7


@pytest.mark.asyncio
async def test_fetch_joint_state_no_target():
    resp = {**FULL_STATE_RESPONSE, "target_head_joints": None}
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.get("http://localhost:8000/api/state/full").mock(
                return_value=httpx.Response(200, json=resp)
            )
            result = await fetch_joint_state(client)

    assert result.target_head_joints is None


@pytest.mark.asyncio
async def test_fetch_daemon_status():
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.get("http://localhost:8000/api/daemon/status").mock(
                return_value=httpx.Response(200, json=DAEMON_STATUS_RESPONSE)
            )
            result = await fetch_daemon_status(client)

    assert isinstance(result, DaemonStatus)
    assert result.control_mode == "enabled"
    assert result.control_loop_freq_hz == 49.60
    assert result.control_loop_max_interval_ms == pytest.approx(20.26)
    assert result.control_loop_error_count == 0
    assert result.error_code is None


@pytest.mark.asyncio
async def test_fetch_daemon_status_with_error():
    resp = {**DAEMON_STATUS_RESPONSE, "error": "motor_fault"}
    async with httpx.AsyncClient() as client:
        with respx.mock:
            respx.get("http://localhost:8000/api/daemon/status").mock(
                return_value=httpx.Response(200, json=resp)
            )
            result = await fetch_daemon_status(client)

    assert result.error_code == "motor_fault"


def test_to_ms():
    assert _to_ms(0.02026) == pytest.approx(20.26)
    assert _to_ms(None) is None
    assert _to_ms(0.0) == 0.0
