"""Microphone capture with energy-based voice activity detection.

Robot mode: Reachy Mini SDK (float32 stereo 16kHz)
Laptop mode: sounddevice (int16 mono 16kHz, converted to float32)
"""

from __future__ import annotations

import collections
import logging
import time

import numpy as np

from reachy_voice.config import (
    CHUNK_DURATION_S,
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
    """Convert float32 frames to int16 mono PCM bytes for Lex."""
    audio = np.concatenate(frames)
    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    # Flatten in case shape is (n, 1)
    mono = mono.ravel()
    int16 = np.clip(mono * 32767, -32768, 32767).astype(np.int16)
    return int16.tobytes()


class AudioCapture:
    """Records audio from microphone.

    Args:
        media: SDK media object for robot mode, or None for laptop mode (sounddevice).
    """

    def __init__(
        self,
        *,
        media: object | None = None,
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
        self._stream: object | None = None
        self._chunk_samples = int(SAMPLE_RATE * CHUNK_DURATION_S)

        if not media:
            import sounddevice as sd

            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                blocksize=self._chunk_samples,
            )
            self._stream.start()  # type: ignore[union-attr]
            logger.info("Audio capture started (sounddevice)")
        else:
            logger.info("Audio capture ready (SDK)")

    def _get_chunk(self) -> np.ndarray | None:
        """Get one audio chunk as float32."""
        if self._media:
            chunk = self._media.get_audio_sample()  # type: ignore[union-attr]
            if chunk is None or chunk.size == 0:
                return None
            return chunk  # float32 stereo (samples, 2)

        chunk, overflowed = self._stream.read(self._chunk_samples)  # type: ignore[union-attr]
        if overflowed:
            logger.debug("Audio buffer overflow")
        # int16 (samples, 1) -> float32
        return chunk.astype(np.float32) / 32768.0

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
            chunk = self._get_chunk()
            if chunk is None:
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
        duration = audio.shape[0] / SAMPLE_RATE

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
            chunk = self._get_chunk()
            if chunk is not None:
                frames.append(chunk)
        if not frames:
            return b""
        pcm = _to_pcm_int16(frames)
        logger.info("Recorded %d bytes PCM", len(pcm))
        return pcm

    def close(self) -> None:
        """Close laptop-mode sounddevice stream (no-op in robot mode)."""
        if self._stream:
            try:
                self._stream.close()  # type: ignore[union-attr]
            except Exception:
                logger.debug("stream close failed", exc_info=True)
            self._stream = None
