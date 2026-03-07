"""Tests for reachy_voice.audio_capture (unit-testable parts)."""

import numpy as np
import pytest

try:
    from reachy_voice.audio_capture import _rms

    _has_portaudio = True
except OSError:
    _has_portaudio = False

pytestmark = pytest.mark.skipif(not _has_portaudio, reason="PortAudio not available")


def test_rms_silence():
    silence = np.zeros(1600, dtype=np.int16)
    assert _rms(silence) == 0.0


def test_rms_signal():
    signal = np.full(1600, 1000, dtype=np.int16)
    assert _rms(signal) == 1000.0


def test_rms_mixed():
    chunk = np.array([0, 1000, 0, -1000], dtype=np.int16)
    expected = np.sqrt(np.mean(np.array([0, 1000, 0, -1000], dtype=np.float64) ** 2))
    assert abs(_rms(chunk) - expected) < 0.01
