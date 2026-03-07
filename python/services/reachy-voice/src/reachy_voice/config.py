"""Environment-based configuration for reachy-voice."""

from __future__ import annotations

import os

# Lex V2 Bot
LEX_BOT_ID: str = os.environ.get("LEX_BOT_ID", "DQCBGQZ5XT")
LEX_BOT_ALIAS_ID: str = os.environ.get("LEX_BOT_ALIAS_ID", "AA8WY50QIT")
LEX_LOCALE_ID: str = os.environ.get("LEX_LOCALE_ID", "en_US")

# AWS
AWS_REGION: str = os.environ.get("AWS_REGION", "us-east-1")

# Voice mode: "robot" (daemon app) or "laptop" (standalone CLI)
VOICE_MODE: str = os.environ.get("VOICE_MODE", "robot")

# Voice Activity Detection (thresholds are float32 amplitude, range 0.0-1.0)
SILENCE_THRESHOLD: float = float(os.environ.get("SILENCE_THRESHOLD", "0.09"))
SILENCE_DURATION_S: float = float(os.environ.get("SILENCE_DURATION_S", "1.5"))
MAX_RECORD_S: float = float(os.environ.get("MAX_RECORD_S", "10"))
MIN_RECORD_S: float = float(os.environ.get("MIN_RECORD_S", "0.5"))

# Session
SESSION_TIMEOUT_S: float = float(os.environ.get("SESSION_TIMEOUT_S", "60"))

# Visual feedback
ENABLE_VISUAL_FEEDBACK: bool = os.environ.get("ENABLE_VISUAL_FEEDBACK", "true").lower() in (
    "true",
    "1",
    "yes",
)

# Audio constants
SAMPLE_RATE: int = 16000
CHUNK_DURATION_S: float = 0.1  # 100ms per chunk (laptop mode sounddevice blocksize)
PRE_ROLL_CHUNKS: int = 3  # keep last 3 chunks before speech starts
