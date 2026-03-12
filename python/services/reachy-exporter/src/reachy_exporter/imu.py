"""IMU reader using the reachy_mini SDK (optional dependency)."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IMUReading:
    """Processed IMU reading."""

    accel_magnitude_ms2: float | None
    gyro_magnitude_rads: float | None
    board_temperature_c: float | None


_NULL_READING = IMUReading(
    accel_magnitude_ms2=None,
    gyro_magnitude_rads=None,
    board_temperature_c=None,
)


class IMUReader:
    """Reads IMU data from a Reachy-Mini device."""

    def __init__(self, *, enabled: bool = True) -> None:
        self._mini: object | None = None
        self._enabled = enabled

    def connect(self) -> None:
        if not self._enabled:
            return
        try:
            from reachy_mini import ReachyMini  # type: ignore[import-untyped]

            self._mini = ReachyMini(media_backend="no_media")
            logger.info("Connected to Reachy-Mini IMU")
        except ImportError:
            logger.warning("reachy_mini SDK not installed — IMU disabled")
            self._enabled = False
        except Exception:
            logger.exception("Failed to connect to Reachy-Mini IMU")
            self._mini = None
            self._enabled = False

    def read(self) -> IMUReading:
        if not self._enabled or self._mini is None:
            return _NULL_READING

        try:
            imu = self._mini.imu  # type: ignore[attr-defined]
            accel = imu["accelerometer"]  # [ax, ay, az] m/s²
            gyro = imu["gyroscope"]  # [gx, gy, gz] rad/s
            temperature = imu.get("temperature")

            accel_mag = math.sqrt(sum(a * a for a in accel))
            gyro_mag = math.sqrt(sum(g * g for g in gyro))

            return IMUReading(
                accel_magnitude_ms2=accel_mag,
                gyro_magnitude_rads=gyro_mag,
                board_temperature_c=float(temperature) if temperature is not None else None,
            )
        except Exception:
            logger.exception("Failed to read IMU")
            return _NULL_READING

    def close(self) -> None:
        if self._mini is not None:
            try:
                self._mini.client.disconnect()  # type: ignore[attr-defined]
            except Exception:
                logger.debug("IMU disconnect failed", exc_info=True)
            self._mini = None
