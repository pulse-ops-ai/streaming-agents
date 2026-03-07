"""Tests for reachy_exporter.publisher."""

import json
from unittest.mock import MagicMock, patch

import pytest

from reachy_exporter.publisher import Publisher
from streaming_agents_core import R17TelemetryV2Event


def _make_event(**overrides) -> R17TelemetryV2Event:
    defaults = {
        "schema_version": "r17.telemetry.v2",
        "event_id": "test-event-001",
        "asset_id": "R-17",
        "timestamp": "2026-03-05T12:00:00+00:00",
        "source": "reachy-exporter",
        "sequence": 0,
        "sampling_hz": 2.0,
        "joint_position_error_deg": 0.5,
        "board_temperature_c": 43.5,
        "accel_magnitude_ms2": 9.8,
        "gyro_magnitude_rads": 0.01,
    }
    defaults.update(overrides)
    return R17TelemetryV2Event(**defaults)


def test_dry_run_writes_to_stdout(capsys):
    pub = Publisher(dry_run=True)
    pub.connect()
    event = _make_event()
    pub.publish(event)

    captured = capsys.readouterr()
    data = json.loads(captured.out.strip())
    assert data["asset_id"] == "R-17"
    assert data["schema_version"] == "r17.telemetry.v2"
    assert data["source"] == "reachy-exporter"


def test_publish_without_connect_raises():
    pub = Publisher(dry_run=False)
    with pytest.raises(RuntimeError, match="not connected"):
        pub.publish(_make_event())


@patch("reachy_exporter.publisher.boto3")
def test_publish_calls_kinesis(mock_boto3):
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client

    pub = Publisher(dry_run=False)
    pub.connect()
    event = _make_event()
    pub.publish(event)

    mock_client.put_record.assert_called_once()
    call_kwargs = mock_client.put_record.call_args[1]
    assert call_kwargs["PartitionKey"] == "R-17"
    assert b"r17.telemetry.v2" in call_kwargs["Data"]


def test_close_resets_client():
    pub = Publisher(dry_run=True)
    pub.connect()
    pub.close()
    assert pub._client is None
