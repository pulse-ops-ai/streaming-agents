"""Tests for reachy_exporter.main."""

import math

import pytest

from reachy_exporter.main import (
    _REACHY_CONTROL_MODE_MAP,
    _compute_position_error,
    _parse_args,
    _resolve_control_mode,
)
from streaming_agents_core import ControlMode


class TestComputePositionError:
    def test_with_target(self):
        head = [0.0, 0.5, -0.5, 0.6, -0.6, 0.5, -0.5]
        target = [0.0, 0.5, -0.5, 0.54, -0.6, 0.5, -0.5]
        error = _compute_position_error(head, target)
        expected = abs(0.54 - 0.6) * (180.0 / math.pi)
        assert error == pytest.approx(expected)

    def test_without_target(self):
        head = [0.0, 0.5, -0.5, 0.6, -0.6, 0.5, -0.5]
        assert _compute_position_error(head, None) == 0.0

    def test_target_too_short(self):
        head = [0.0, 0.5, -0.5, 0.6, -0.6, 0.5, -0.5]
        target = [0.0, 0.5]  # Too short to have J3_INDEX
        assert _compute_position_error(head, target) == 0.0

    def test_head_too_short(self):
        head = [0.0, 0.5]  # Too short
        target = [0.0, 0.5, -0.5, 0.54, -0.6, 0.5, -0.5]
        assert _compute_position_error(head, target) == 0.0

    def test_zero_error(self):
        joints = [0.0, 0.5, -0.5, 0.6, -0.6, 0.5, -0.5]
        assert _compute_position_error(joints, joints) == 0.0


class TestResolveControlMode:
    def test_enabled_maps_to_stiff(self):
        assert _resolve_control_mode("enabled") == ControlMode.stiff

    def test_disabled_maps_to_idle(self):
        assert _resolve_control_mode("disabled") == ControlMode.idle

    def test_gravity_compensation_maps_to_compliant(self):
        assert _resolve_control_mode("gravity_compensation") == ControlMode.compliant

    def test_none_returns_none(self):
        assert _resolve_control_mode(None) is None

    def test_unknown_value_returns_unknown(self):
        assert _resolve_control_mode("something_else") == ControlMode.unknown

    def test_case_insensitive(self):
        assert _resolve_control_mode("ENABLED") == ControlMode.stiff
        assert _resolve_control_mode("Disabled") == ControlMode.idle

    def test_whitespace_stripped(self):
        assert _resolve_control_mode("  enabled  ") == ControlMode.stiff


class TestParseArgs:
    def test_defaults(self):
        args = _parse_args([])
        assert args.dry_run is False
        assert args.once is False
        assert args.log_level == "INFO"

    def test_dry_run(self):
        args = _parse_args(["--dry-run"])
        assert args.dry_run is True

    def test_once(self):
        args = _parse_args(["--once"])
        assert args.once is True

    def test_log_level(self):
        args = _parse_args(["--log-level", "DEBUG"])
        assert args.log_level == "DEBUG"


class TestControlModeMap:
    def test_all_reachy_modes_mapped(self):
        assert "enabled" in _REACHY_CONTROL_MODE_MAP
        assert "disabled" in _REACHY_CONTROL_MODE_MAP
        assert "gravity_compensation" in _REACHY_CONTROL_MODE_MAP
        assert len(_REACHY_CONTROL_MODE_MAP) == 3
