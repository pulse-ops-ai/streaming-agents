"""Tests for reachy_exporter.imu."""

from reachy_exporter.imu import _NULL_READING, IMUReader


def test_imu_reader_disabled():
    reader = IMUReader(enabled=False)
    reader.connect()
    reading = reader.read()
    assert reading is _NULL_READING
    assert reading.accel_magnitude_ms2 is None
    assert reading.gyro_magnitude_rads is None
    assert reading.board_temperature_c is None


def test_imu_reader_sdk_unavailable():
    """When SDK is not installed, reader gracefully returns nulls."""
    reader = IMUReader(enabled=True)
    reader.connect()
    reading = reader.read()
    assert reading is _NULL_READING


def test_null_reading_values():
    assert _NULL_READING.accel_magnitude_ms2 is None
    assert _NULL_READING.gyro_magnitude_rads is None
    assert _NULL_READING.board_temperature_c is None


def test_imu_reader_close():
    reader = IMUReader(enabled=False)
    reader.close()
    assert reader._mini is None
