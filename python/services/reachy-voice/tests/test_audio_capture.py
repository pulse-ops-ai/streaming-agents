"""Tests for reachy_voice.audio_capture."""

import numpy as np

from reachy_voice.audio_capture import _rms, _to_pcm_int16


def test_rms_silence():
    silence = np.zeros((1600, 2), dtype=np.float32)
    assert _rms(silence) == 0.0


def test_rms_signal():
    signal = np.full((1600, 2), 0.5, dtype=np.float32)
    assert abs(_rms(signal) - 0.5) < 0.001


def test_rms_mono():
    signal = np.full(1600, 0.25, dtype=np.float32)
    assert abs(_rms(signal) - 0.25) < 0.001


def test_rms_empty():
    empty = np.array([], dtype=np.float32)
    assert _rms(empty) == 0.0


def test_to_pcm_int16_stereo():
    """Stereo float32 converts to mono int16 PCM."""
    # 0.5 in float32 -> 0.5 * 32767 = 16383 in int16
    chunk = np.full((100, 2), 0.5, dtype=np.float32)
    pcm = _to_pcm_int16([chunk])
    result = np.frombuffer(pcm, dtype=np.int16)
    assert len(result) == 100
    assert result[0] == 16383


def test_to_pcm_int16_clipping():
    """Values beyond [-1, 1] are clipped."""
    chunk = np.array([[2.0, 2.0]], dtype=np.float32)
    pcm = _to_pcm_int16([chunk])
    result = np.frombuffer(pcm, dtype=np.int16)
    assert result[0] == 32767
