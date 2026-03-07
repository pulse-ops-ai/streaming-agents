"""Tests for reachy_voice.config."""

from reachy_voice.config import (
    LEX_BOT_ALIAS_ID,
    LEX_BOT_ID,
    LEX_LOCALE_ID,
    MAX_RECORD_S,
    MIN_RECORD_S,
    REACHY_MEDIA_BACKEND,
    SAMPLE_RATE,
    SESSION_TIMEOUT_S,
    SILENCE_DURATION_S,
    SILENCE_THRESHOLD,
)


def test_lex_defaults():
    assert LEX_BOT_ID == "DQCBGQZ5XT"
    assert LEX_BOT_ALIAS_ID == "AA8WY50QIT"
    assert LEX_LOCALE_ID == "en_US"


def test_audio_constants():
    assert SAMPLE_RATE == 16000


def test_vad_defaults():
    assert SILENCE_THRESHOLD == 0.015
    assert SILENCE_DURATION_S == 1.5
    assert MAX_RECORD_S == 10.0
    assert MIN_RECORD_S == 0.5


def test_session_timeout():
    assert SESSION_TIMEOUT_S == 60.0


def test_media_backend():
    assert REACHY_MEDIA_BACKEND == "default"
