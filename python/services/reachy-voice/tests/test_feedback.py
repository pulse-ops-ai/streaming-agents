"""Tests for reachy_voice.feedback."""

from unittest.mock import MagicMock

from reachy_voice.feedback import VisualFeedback


def test_feedback_disabled_no_crash():
    fb = VisualFeedback(enabled=False)
    fb.on_listening()
    fb.on_processing()
    fb.on_speaking()
    fb.close()


def test_feedback_no_reachy_mini_disables():
    fb = VisualFeedback(reachy_mini=None, enabled=True)
    assert not fb._enabled
    fb.on_listening()
    fb.on_processing()
    fb.on_speaking()
    fb.close()


def test_feedback_with_mock_reachy():
    mock_mini = MagicMock()
    fb = VisualFeedback(reachy_mini=mock_mini, enabled=True)
    assert fb._enabled
    # Methods should not raise even if SDK calls fail
    fb.on_listening()
    fb.on_processing()
    fb.on_speaking()
    fb.close()
