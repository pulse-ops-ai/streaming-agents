"""Kinesis publisher with dry-run support."""

from __future__ import annotations

import logging
import sys
from typing import TYPE_CHECKING

import boto3

from reachy_exporter.config import AWS_ENDPOINT_URL, AWS_REGION, KINESIS_STREAM_NAME

if TYPE_CHECKING:
    from streaming_agents_core import R17TelemetryV2Event

logger = logging.getLogger(__name__)


class Publisher:
    """Publishes telemetry events to Kinesis or stdout."""

    def __init__(self, *, dry_run: bool = False) -> None:
        self._dry_run = dry_run
        self._client: object | None = None

    def connect(self) -> None:
        if self._dry_run:
            logger.info("Dry-run mode — publishing to stdout")
            return

        kwargs: dict[str, str] = {"region_name": AWS_REGION}
        if AWS_ENDPOINT_URL:
            kwargs["endpoint_url"] = AWS_ENDPOINT_URL

        self._client = boto3.client("kinesis", **kwargs)
        logger.info("Connected to Kinesis stream %s in %s", KINESIS_STREAM_NAME, AWS_REGION)

    def publish(self, event: R17TelemetryV2Event) -> None:
        payload = event.model_dump_json()

        if self._dry_run:
            sys.stdout.write(payload + "\n")
            sys.stdout.flush()
            return

        if self._client is None:
            raise RuntimeError("Publisher not connected — call connect() first")

        self._client.put_record(  # type: ignore[union-attr]
            StreamName=KINESIS_STREAM_NAME,
            Data=payload.encode(),
            PartitionKey=event.asset_id,
        )
        logger.debug("Published event %s", event.event_id)

    def close(self) -> None:
        self._client = None
