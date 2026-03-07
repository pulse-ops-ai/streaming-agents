"""Visual feedback via Reachy Mini SDK (head movements)."""

from __future__ import annotations

import logging

from reachy_voice.config import ENABLE_VISUAL_FEEDBACK

logger = logging.getLogger(__name__)


class VisualFeedback:
    """Best-effort visual feedback using the Reachy Mini SDK.

    All methods are fire-and-forget — failures are logged, never raised.
    In laptop mode (no reachy_mini), feedback is silently disabled.
    """

    def __init__(
        self,
        *,
        reachy_mini: object | None = None,
        enabled: bool = ENABLE_VISUAL_FEEDBACK,
    ) -> None:
        self._mini = reachy_mini
        self._enabled = enabled and reachy_mini is not None
        if self._enabled:
            logger.info("Visual feedback enabled (SDK)")

    def on_listening(self) -> None:
        """Signal that the robot is listening for speech."""
        if not self._enabled:
            return
        logger.debug("State: listening")
        try:
            from reachy_mini.utils import create_head_pose

            self._mini.goto_target(  # type: ignore[union-attr]
                head=create_head_pose(pitch=-5, mm=False),
                duration=0.5,
            )
        except Exception:
            logger.debug("Visual feedback (listening) failed", exc_info=True)

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
        try:
            from reachy_mini.utils import create_head_pose

            self._mini.goto_target(  # type: ignore[union-attr]
                head=create_head_pose(pitch=3, mm=False),
                duration=0.3,
            )
        except Exception:
            logger.debug("Visual feedback (speaking) failed", exc_info=True)

    def close(self) -> None:
        pass
