"""Optional visual feedback via Reachy REST API (head movements)."""

from __future__ import annotations

import logging

import httpx

from reachy_voice.config import ENABLE_VISUAL_FEEDBACK, REACHY_HOST, REACHY_PORT

logger = logging.getLogger(__name__)


class VisualFeedback:
    """Best-effort visual feedback using the Reachy daemon REST API.

    All methods are fire-and-forget — failures are logged, never raised.
    """

    def __init__(
        self,
        *,
        host: str = REACHY_HOST,
        port: int = REACHY_PORT,
        enabled: bool = ENABLE_VISUAL_FEEDBACK,
    ) -> None:
        self._enabled = enabled
        self._base_url = f"http://{host}:{port}"
        self._client: httpx.Client | None = None
        if enabled:
            try:
                self._client = httpx.Client(base_url=self._base_url, timeout=2.0)
                logger.info("Visual feedback enabled (daemon at %s)", self._base_url)
            except Exception:
                logger.warning("Could not create HTTP client for visual feedback")
                self._enabled = False

    def on_listening(self) -> None:
        """Signal that the robot is listening for speech."""
        if not self._enabled:
            return
        logger.debug("State: listening")
        # Subtle antenna movement to indicate listening
        self._try_post("/api/moves/play", {"name": "idle_look_around", "duration": 2.0})

    def on_processing(self) -> None:
        """Signal that the robot is processing the request."""
        if not self._enabled:
            return
        logger.debug("State: processing")

    def on_speaking(self) -> None:
        """Signal that the robot is speaking the response."""
        if not self._enabled:
            return
        logger.debug("State: speaking")
        self._try_post("/api/moves/play", {"name": "nod_yes", "duration": 1.0})

    def _try_post(self, path: str, payload: dict) -> None:
        """Fire-and-forget POST request. Never raises."""
        if not self._client:
            return
        try:
            resp = self._client.post(path, json=payload)
            if resp.status_code == 404:
                logger.debug("Endpoint %s not available (404)", path)
            elif resp.status_code >= 400:
                logger.debug("Feedback request %s returned %d", path, resp.status_code)
        except Exception:
            logger.debug("Feedback request %s failed (connection error)", path)

    def close(self) -> None:
        if self._client:
            self._client.close()
            self._client = None
