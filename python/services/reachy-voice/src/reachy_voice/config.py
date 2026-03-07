"""Environment-based configuration for reachy-voice."""

from __future__ import annotations

import os

# Lex V2 Bot
LEX_BOT_ID: str = os.environ.get("LEX_BOT_ID", "DQCBGQZ5XT")
LEX_BOT_ALIAS_ID: str = os.environ.get("LEX_BOT_ALIAS_ID", "AA8WY50QIT")
LEX_LOCALE_ID: str = os.environ.get("LEX_LOCALE_ID", "en_US")

# AWS
AWS_REGION: str = os.environ.get("AWS_REGION", "us-east-1")

# Reachy Mini SDK
REACHY_MEDIA_BACKEND: str = os.environ.get("REACHY_MEDIA_BACKEND", "default")

# Voice Activity Detection (thresholds are float32 amplitude, range 0.0-1.0)
SILENCE_THRESHOLD: float = float(os.environ.get("SILENCE_THRESHOLD", "0.015"))
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
PRE_ROLL_CHUNKS: int = 3  # keep last 3 SDK chunks before speech starts
