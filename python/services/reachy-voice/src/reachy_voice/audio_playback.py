"""Audio playback for MP3 responses from Polly via Lex."""

from __future__ import annotations

import contextlib
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_pygame_available = False
try:
    import pygame

    _pygame_available = True
except ImportError:
    logger.debug("pygame not available, will use mpv/ffplay fallback")


class AudioPlayer:
    """Plays MP3 audio through the system speaker."""

    def __init__(self) -> None:
        self._initialized = False
        if _pygame_available:
            try:
                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=2048)
                self._initialized = True
                logger.info("Audio player initialized (pygame)")
            except Exception:
                logger.warning("pygame.mixer.init failed, will use subprocess fallback")

    def play_mp3(self, data: bytes) -> None:
        """Play MP3 audio data through the speaker."""
        if not data:
            logger.warning("No audio data to play")
            return

        if self._initialized:
            self._play_pygame(data)
        else:
            self._play_subprocess(data)

    def play_pcm(self, data: bytes, sample_rate: int = 16000) -> None:
        """Play raw PCM int16 mono audio (for mic test playback)."""
        if self._initialized:
            try:
                import numpy as np

                audio = np.frombuffer(data, dtype=np.int16)
                # Convert mono int16 to stereo float32 for pygame
                stereo = np.column_stack([audio, audio]).astype(np.float32) / 32768.0
                sound = pygame.sndarray.make_sound((stereo * 32767).astype(np.int16))
                sound.play()
                while pygame.mixer.get_busy():
                    pygame.time.wait(50)
            except Exception:
                logger.exception("PCM playback via pygame failed")
                self._play_pcm_subprocess(data, sample_rate)
        else:
            self._play_pcm_subprocess(data, sample_rate)

    def _play_pygame(self, data: bytes) -> None:
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
            logger.exception("pygame playback failed, trying subprocess")
            if tmp_path:
                self._play_file_subprocess(tmp_path)
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    def _play_subprocess(self, data: bytes) -> None:
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
        for cmd in [["mpv", "--no-video", "--really-quiet"], ["ffplay", "-nodisp", "-autoexit"]]:
            if shutil.which(cmd[0]):
                subprocess.run([*cmd, path], check=True, capture_output=True)
                return
        logger.error("No audio player found (install pygame, mpv, or ffplay)")

    def _play_pcm_subprocess(self, data: bytes, sample_rate: int) -> None:
        if shutil.which("aplay"):
            subprocess.run(
                ["aplay", "-f", "S16_LE", "-r", str(sample_rate), "-c", "1", "-"],
                input=data,
                check=True,
                capture_output=True,
            )
        else:
            logger.error("No PCM player found (install aplay)")

    def close(self) -> None:
        if self._initialized:
            with contextlib.suppress(Exception):
                pygame.mixer.quit()
