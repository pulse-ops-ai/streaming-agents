"""Audio playback via Reachy Mini SDK. MP3 decoded with ffmpeg."""

from __future__ import annotations

import logging
import subprocess
import time

import numpy as np

from reachy_voice.config import SAMPLE_RATE

logger = logging.getLogger(__name__)


class AudioPlayer:
    """Plays audio through the Reachy Mini speaker via the SDK."""

    def __init__(self, *, media: object) -> None:
        self._media = media
        self._media.start_playing()
        logger.info("Audio player started (SDK)")

    def play_mp3(self, data: bytes) -> None:
        """Decode MP3 data via ffmpeg and play through the SDK."""
        if not data:
            logger.warning("No audio data to play")
            return

        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "f32le",
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "1",
                "pipe:1",
            ],
            input=data,
            capture_output=True,
        )
        if result.returncode != 0:
            logger.error("ffmpeg MP3 decode failed: %s", result.stderr.decode(errors="replace"))
            return

        samples = np.frombuffer(result.stdout, dtype=np.float32)
        if samples.size == 0:
            logger.warning("ffmpeg produced no audio output")
            return

        self._push_and_wait(samples)

    def play_pcm(self, data: bytes, sample_rate: int = SAMPLE_RATE) -> None:
        """Play raw PCM int16 mono audio (for mic test playback)."""
        if not data:
            return
        int16 = np.frombuffer(data, dtype=np.int16)
        samples = int16.astype(np.float32) / 32768.0
        self._push_and_wait(samples, sample_rate)

    def _push_and_wait(self, samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
        """Push float32 samples to SDK and block until playback finishes."""
        # SDK expects shape (samples, 1 or 2)
        mono = samples.reshape(-1, 1)
        self._media.push_audio_sample(mono)
        duration = len(samples) / sample_rate
        time.sleep(duration)

    def close(self) -> None:
        """Stop SDK playback."""
        try:
            self._media.stop_playing()
        except Exception:
            logger.debug("stop_playing failed", exc_info=True)
