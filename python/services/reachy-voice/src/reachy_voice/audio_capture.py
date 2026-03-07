"""Microphone capture with energy-based voice activity detection."""

from __future__ import annotations

import collections
import logging
import time

import numpy as np
import sounddevice as sd

from reachy_voice.config import (
    CHANNELS,
    CHUNK_DURATION_S,
    MAX_RECORD_S,
    MIN_RECORD_S,
    PRE_ROLL_CHUNKS,
    SAMPLE_RATE,
    SILENCE_DURATION_S,
    SILENCE_THRESHOLD,
)

logger = logging.getLogger(__name__)


def find_device(hint: str, kind: str) -> int | None:
    """Find audio device index by name hint.

    Args:
        hint: Substring to match in device name (case-insensitive).
        kind: 'input' or 'output'.

    Returns:
        Device index or None if not found.
    """
    if not hint:
        return None
    devices = sd.query_devices()
    key = f"max_{kind}_channels"
    for i, dev in enumerate(devices):
        if dev[key] > 0 and hint.lower() in dev["name"].lower():
            logger.info("Found %s device: [%d] %s", kind, i, dev["name"])
            return i
    return None


def _rms(chunk: np.ndarray) -> float:
    """Compute RMS energy of an int16 audio chunk."""
    return float(np.sqrt(np.mean(chunk.astype(np.float64) ** 2)))


class AudioCapture:
    """Records audio from microphone with silence-based endpoint detection."""

    def __init__(
        self,
        *,
        device: int | None = None,
        sample_rate: int = SAMPLE_RATE,
        channels: int = CHANNELS,
        silence_threshold: int = SILENCE_THRESHOLD,
        silence_duration_s: float = SILENCE_DURATION_S,
        max_record_s: float = MAX_RECORD_S,
        min_record_s: float = MIN_RECORD_S,
    ) -> None:
        self._device = device
        self._sample_rate = sample_rate
        self._channels = channels
        self._silence_threshold = silence_threshold
        self._silence_duration_s = silence_duration_s
        self._max_record_s = max_record_s
        self._min_record_s = min_record_s
        self._chunk_samples = int(sample_rate * CHUNK_DURATION_S)

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

        logger.debug("Listening for speech (threshold=%d)...", self._silence_threshold)

        with sd.InputStream(
            samplerate=self._sample_rate,
            channels=self._channels,
            dtype="int16",
            device=self._device,
            blocksize=self._chunk_samples,
        ) as stream:
            while True:
                chunk, overflowed = stream.read(self._chunk_samples)
                if overflowed:
                    logger.debug("Audio buffer overflow")

                energy = _rms(chunk)

                if not is_speaking:
                    ring_buffer.append(chunk.copy())
                    if energy > self._silence_threshold:
                        is_speaking = True
                        record_start = time.monotonic()
                        # Include pre-roll for utterance beginning
                        frames.extend(ring_buffer)
                        logger.debug("Speech detected (energy=%.0f)", energy)
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
        duration = len(audio) / self._sample_rate

        if duration < self._min_record_s:
            logger.debug(
                "Recording too short (%.2fs < %.2fs), discarding", duration, self._min_record_s
            )
            return None

        logger.info("Captured %.1fs of audio (%d bytes)", duration, audio.nbytes)
        return audio.tobytes()

    def test_record(self, duration_s: float = 3.0) -> bytes:
        """Record a fixed duration for mic testing."""
        logger.info("Recording %.1f seconds...", duration_s)
        samples = int(self._sample_rate * duration_s)
        audio = sd.rec(
            samples,
            samplerate=self._sample_rate,
            channels=self._channels,
            dtype="int16",
            device=self._device,
        )
        sd.wait()
        logger.info("Recorded %d samples", len(audio))
        return audio.tobytes()
