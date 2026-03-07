"""Environment-based configuration for reachy-voice."""

from __future__ import annotations

import os

# Lex V2 Bot
LEX_BOT_ID: str = os.environ.get("LEX_BOT_ID", "DQCBGQZ5XT")
LEX_BOT_ALIAS_ID: str = os.environ.get("LEX_BOT_ALIAS_ID", "AA8WY50QIT")
LEX_LOCALE_ID: str = os.environ.get("LEX_LOCALE_ID", "en_US")

# AWS
AWS_REGION: str = os.environ.get("AWS_REGION", "us-east-1")

# Audio devices (empty string = auto-detect)
AUDIO_INPUT_DEVICE: str = os.environ.get("AUDIO_INPUT_DEVICE", "")
AUDIO_OUTPUT_DEVICE: str = os.environ.get("AUDIO_OUTPUT_DEVICE", "")

# Voice Activity Detection
SILENCE_THRESHOLD: int = int(os.environ.get("SILENCE_THRESHOLD", "500"))
SILENCE_DURATION_S: float = float(os.environ.get("SILENCE_DURATION_S", "1.5"))
MAX_RECORD_S: float = float(os.environ.get("MAX_RECORD_S", "10"))
MIN_RECORD_S: float = float(os.environ.get("MIN_RECORD_S", "0.5"))

# Session
SESSION_TIMEOUT_S: float = float(os.environ.get("SESSION_TIMEOUT_S", "60"))

# Visual feedback (Reachy head movements)
ENABLE_VISUAL_FEEDBACK: bool = os.environ.get("ENABLE_VISUAL_FEEDBACK", "true").lower() in (
    "true",
    "1",
    "yes",
)
REACHY_HOST: str = os.environ.get("REACHY_HOST", "localhost")
REACHY_PORT: int = int(os.environ.get("REACHY_PORT", "8000"))

# Audio constants
SAMPLE_RATE: int = 16000
CHANNELS: int = 1
CHUNK_DURATION_S: float = 0.1  # 100ms per chunk
PRE_ROLL_CHUNKS: int = 3  # keep 300ms before speech starts
