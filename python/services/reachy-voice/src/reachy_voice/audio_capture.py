"""Microphone capture via Reachy Mini SDK with energy-based voice activity detection."""

from __future__ import annotations

import collections
import logging
import time

import numpy as np

from reachy_voice.config import (
    MAX_RECORD_S,
    MIN_RECORD_S,
    PRE_ROLL_CHUNKS,
    SAMPLE_RATE,
    SILENCE_DURATION_S,
    SILENCE_THRESHOLD,
)

logger = logging.getLogger(__name__)


def _rms(chunk: np.ndarray) -> float:
    """Compute RMS energy of a float32 audio chunk (stereo or mono)."""
    if chunk.size == 0:
        return 0.0
    mono = chunk.mean(axis=1) if chunk.ndim == 2 else chunk
    return float(np.sqrt(np.mean(mono.astype(np.float64) ** 2)))


def _to_pcm_int16(frames: list[np.ndarray]) -> bytes:
    """Convert float32 stereo frames to int16 mono PCM bytes for Lex."""
    audio = np.concatenate(frames)
    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    int16 = np.clip(mono * 32767, -32768, 32767).astype(np.int16)
    return int16.tobytes()


class AudioCapture:
    """Records audio from microphone via the Reachy Mini SDK."""

    def __init__(
        self,
        *,
        media: object,
        silence_threshold: float = SILENCE_THRESHOLD,
        silence_duration_s: float = SILENCE_DURATION_S,
        max_record_s: float = MAX_RECORD_S,
        min_record_s: float = MIN_RECORD_S,
    ) -> None:
        self._media = media
        self._silence_threshold = silence_threshold
        self._silence_duration_s = silence_duration_s
        self._max_record_s = max_record_s
        self._min_record_s = min_record_s
        self._media.start_recording()
        logger.info("Audio capture started (SDK)")

    def record_utterance(self) -> bytes | None:
        """Block until speech detected, record until silence, return PCM bytes.

        Returns:
            Raw PCM bytes (16-bit signed, mono, 16kHz) or None if no valid speech.
        """
        ring_buffer: collections.deque[np.ndarray] = collections.deque(maxlen=PRE_ROLL_CHUNKS)
        frames: list[np.ndarray] = []
        is_speaking = False
        record_start: float | None = None
        silence_start: float | None = None

        logger.debug("Listening for speech (threshold=%.4f)...", self._silence_threshold)

        while True:
            chunk = self._media.get_audio_sample()
            if chunk is None or chunk.size == 0:
                continue

            energy = _rms(chunk)

            if not is_speaking:
                ring_buffer.append(chunk.copy())
                if energy > self._silence_threshold:
                    is_speaking = True
                    record_start = time.monotonic()
                    frames.extend(ring_buffer)
                    logger.debug("Speech detected (energy=%.4f)", energy)
                continue

            frames.append(chunk.copy())
            elapsed = time.monotonic() - record_start  # type: ignore[operator]

            if energy < self._silence_threshold:
                if silence_start is None:
                    silence_start = time.monotonic()
                elif time.monotonic() - silence_start >= self._silence_duration_s:
                    logger.debug("Silence detected, stopping (%.1fs recorded)", elapsed)
                    break
            else:
                silence_start = None

            if elapsed >= self._max_record_s:
                logger.debug("Max duration reached (%.1fs)", elapsed)
                break

        if not frames:
            return None

        audio = np.concatenate(frames)
        duration = len(audio) / SAMPLE_RATE

        if duration < self._min_record_s:
            logger.debug(
                "Recording too short (%.2fs < %.2fs), discarding", duration, self._min_record_s
            )
            return None

        pcm = _to_pcm_int16(frames)
        logger.info("Captured %.1fs of audio (%d bytes PCM)", duration, len(pcm))
        return pcm

    def test_record(self, duration_s: float = 3.0) -> bytes:
        """Record a fixed duration for mic testing."""
        logger.info("Recording %.1f seconds...", duration_s)
        frames: list[np.ndarray] = []
        start = time.monotonic()
        while time.monotonic() - start < duration_s:
            chunk = self._media.get_audio_sample()
            if chunk is not None and chunk.size > 0:
                frames.append(chunk)
        if not frames:
            return b""
        pcm = _to_pcm_int16(frames)
        logger.info("Recorded %d bytes PCM", len(pcm))
        return pcm

    def close(self) -> None:
        """Stop SDK recording."""
        try:
            self._media.stop_recording()
        except Exception:
            logger.debug("stop_recording failed", exc_info=True)
