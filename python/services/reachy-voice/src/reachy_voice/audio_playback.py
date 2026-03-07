"""Audio playback.

Robot mode: MP3 decoded with ffmpeg, pushed to Reachy Mini SDK.
Laptop mode: pygame.mixer or subprocess fallback (mpv/ffplay).
"""

from __future__ import annotations

import contextlib
import logging
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np

from reachy_voice.config import SAMPLE_RATE

logger = logging.getLogger(__name__)


class AudioPlayer:
    """Plays audio through speaker.

    Args:
        media: SDK media object for robot mode, or None for laptop mode (pygame/subprocess).
    """

    def __init__(self, *, media: object | None = None) -> None:
        self._media = media
        self._pygame_init = False

        if not media:
            try:
                import pygame

                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=2048)
                self._pygame_init = True
                logger.info("Audio player started (pygame)")
            except Exception:
                logger.info("Audio player started (subprocess fallback)")
        else:
            logger.info("Audio player ready (SDK)")

    def play_mp3(self, data: bytes) -> None:
        """Play MP3 audio data."""
        if not data:
            logger.warning("No audio data to play")
            return

        if self._media:
            self._play_mp3_sdk(data)
        elif self._pygame_init:
            self._play_mp3_pygame(data)
        else:
            self._play_mp3_subprocess(data)

    def play_pcm(self, data: bytes, sample_rate: int = SAMPLE_RATE) -> None:
        """Play raw PCM int16 mono audio (for mic test playback)."""
        if not data:
            return

        if self._media:
            int16 = np.frombuffer(data, dtype=np.int16)
            samples = int16.astype(np.float32) / 32768.0
            mono = samples.reshape(-1, 1)
            self._media.push_audio_sample(mono)  # type: ignore[union-attr]
            time.sleep(len(samples) / sample_rate)
        elif shutil.which("aplay"):
            subprocess.run(
                ["aplay", "-f", "S16_LE", "-r", str(sample_rate), "-c", "1", "-"],
                input=data,
                check=False,
                capture_output=True,
            )
        else:
            logger.error("No PCM player found (install aplay)")

    # -- Robot mode --

    def _play_mp3_sdk(self, data: bytes) -> None:
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

        mono = samples.reshape(-1, 1)
        self._media.push_audio_sample(mono)  # type: ignore[union-attr]
        time.sleep(len(samples) / SAMPLE_RATE)

    # -- Laptop mode --

    def _play_mp3_pygame(self, data: bytes) -> None:
        import pygame

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp_path = tmp.name
                tmp.write(data)
            pygame.mixer.music.load(tmp_path)
            pygame.mixer.music.play()
            while pygame.mixer.music.get_busy():
                pygame.time.wait(50)
        except Exception:
            logger.exception("pygame playback failed")
            if tmp_path:
                self._play_file_subprocess(tmp_path)
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    def _play_mp3_subprocess(self, data: bytes) -> None:
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp_path = tmp.name
                tmp.write(data)
            self._play_file_subprocess(tmp_path)
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    def _play_file_subprocess(self, path: str) -> None:
        for cmd in [
            ["mpv", "--no-video", "--really-quiet"],
            ["ffplay", "-nodisp", "-autoexit"],
            ["afplay"],
        ]:
            if shutil.which(cmd[0]):
                subprocess.run([*cmd, path], check=True, capture_output=True)
                return
        logger.error("No audio player found (install mpv, ffplay, or afplay)")

    def close(self) -> None:
        """Close laptop-mode pygame (no-op in robot mode)."""
        if self._pygame_init:
            with contextlib.suppress(Exception):
                import pygame

                pygame.mixer.quit()
