"""Lex session management with inactivity timeout."""

from __future__ import annotations

import logging
import time
import uuid

from reachy_voice.config import SESSION_TIMEOUT_S

logger = logging.getLogger(__name__)


class SessionManager:
    """Manages Lex conversation session IDs with automatic timeout reset."""

    def __init__(self, *, timeout_s: float = SESSION_TIMEOUT_S) -> None:
        self._timeout_s = timeout_s
        self._session_id = self._new_id()
        self._last_activity = time.monotonic()

    @property
    def session_id(self) -> str:
        """Get current session ID, resetting if timed out."""
        if time.monotonic() - self._last_activity > self._timeout_s:
            logger.info("Session timed out after %.0fs, starting new conversation", self._timeout_s)
            self.reset()
        return self._session_id

    def touch(self) -> None:
        """Update last activity timestamp."""
        self._last_activity = time.monotonic()

    def reset(self) -> None:
        """Force a new session."""
        self._session_id = self._new_id()
        self._last_activity = time.monotonic()
        logger.info("New session: %s", self._session_id)

    @staticmethod
    def _new_id() -> str:
        return str(uuid.uuid4())
