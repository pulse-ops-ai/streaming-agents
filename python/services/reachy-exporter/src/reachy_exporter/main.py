"""CLI entry point for the reachy-exporter service."""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import math
import signal
from datetime import UTC, datetime

import httpx
from ulid import ULID

from reachy_exporter.client import fetch_daemon_status, fetch_joint_state
from reachy_exporter.config import IMU_ENABLED, J3_INDEX, SAMPLING_HZ
from reachy_exporter.imu import IMUReader
from reachy_exporter.publisher import Publisher
from streaming_agents_core import ControlLoopStats, ControlMode, R17TelemetryV2Event

logger = logging.getLogger("reachy_exporter")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="reachy-exporter",
        description="Edge telemetry exporter for Reachy-Mini hardware",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print JSON to stdout instead of publishing to Kinesis",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Emit one sample and exit",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Set log level (default: INFO)",
    )
    return parser.parse_args(argv)


def _compute_position_error(
    head_joints: list[float],
    target_head_joints: list[float] | None,
) -> float:
    """Compute joint position error in degrees for J3_INDEX."""
    if target_head_joints is None or len(target_head_joints) <= J3_INDEX:
        return 0.0
    if len(head_joints) <= J3_INDEX:
        return 0.0

    error_rad = abs(target_head_joints[J3_INDEX] - head_joints[J3_INDEX])
    return error_rad * (180.0 / math.pi)


def _resolve_control_mode(raw: str | None) -> ControlMode | None:
    if raw is None:
        return None
    normalized = raw.lower().strip()
    try:
        return ControlMode(normalized)
    except ValueError:
        return ControlMode.unknown


async def _sample(
    client: httpx.AsyncClient,
    imu_reader: IMUReader,
    sequence: int,
) -> R17TelemetryV2Event:
    """Collect one telemetry sample from daemon + IMU."""
    joint_state_task = fetch_joint_state(client)
    daemon_status_task = fetch_daemon_status(client)
    joint_state, daemon_status = await asyncio.gather(joint_state_task, daemon_status_task)

    imu_reading = imu_reader.read()

    position_error = _compute_position_error(
        joint_state.head_joints,
        joint_state.target_head_joints,
    )

    control_loop: ControlLoopStats | None = None
    if daemon_status.control_loop_freq_hz is not None:
        control_loop = ControlLoopStats(
            freq_hz=daemon_status.control_loop_freq_hz,
            max_interval_ms=daemon_status.control_loop_max_interval_ms or 0.0,
            error_count=daemon_status.control_loop_error_count or 0,
        )

    return R17TelemetryV2Event(
        schema_version="r17.telemetry.v2",
        event_id=str(ULID()),
        asset_id="r-17",
        timestamp=datetime.now(UTC).isoformat(),
        source="reachy-exporter",
        sequence=sequence,
        sampling_hz=SAMPLING_HZ,
        joint_position_error_deg=position_error,
        board_temperature_c=imu_reading.board_temperature_c,
        accel_magnitude_ms2=imu_reading.accel_magnitude_ms2,
        gyro_magnitude_rads=imu_reading.gyro_magnitude_rads,
        control_mode=_resolve_control_mode(daemon_status.control_mode),
        control_loop_stats=control_loop,
        error_code=daemon_status.error_code,
    )


async def _run(*, dry_run: bool, once: bool) -> None:
    """Main async loop."""
    shutdown = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown.set)

    publisher = Publisher(dry_run=dry_run)
    publisher.connect()

    imu_reader = IMUReader(enabled=IMU_ENABLED)
    imu_reader.connect()

    interval = 1.0 / SAMPLING_HZ
    sequence = 0

    async with httpx.AsyncClient(timeout=5.0) as client:
        while not shutdown.is_set():
            try:
                event = await _sample(client, imu_reader, sequence)
                publisher.publish(event)
                sequence += 1
            except httpx.HTTPError:
                logger.exception("HTTP error polling daemon")
            except Exception:
                logger.exception("Unexpected error during sample")

            if once:
                break

            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(shutdown.wait(), timeout=interval)

    imu_reader.close()
    publisher.close()
    logger.info("Exporter stopped after %d samples", sequence)


def cli(argv: list[str] | None = None) -> None:
    """CLI entry point."""
    args = _parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    asyncio.run(_run(dry_run=args.dry_run, once=args.once))


if __name__ == "__main__":
    cli()
