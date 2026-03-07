"""Tests for reachy_exporter.config."""

from reachy_exporter.config import ASSET_ID, J3_INDEX, KINESIS_STREAM_NAME, SAMPLING_HZ


def test_j3_index_matches_stewart_platform_actuator():
    assert J3_INDEX == 3


def test_default_asset_id():
    assert ASSET_ID == "R-17"


def test_default_sampling_hz():
    assert SAMPLING_HZ == 2.0


def test_default_kinesis_stream():
    assert KINESIS_STREAM_NAME == "streaming-agents-r17-telemetry"
