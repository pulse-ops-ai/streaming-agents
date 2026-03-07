"""Tests for reachy_voice.feedback."""

from reachy_voice.feedback import VisualFeedback


def test_feedback_disabled_no_crash():
    fb = VisualFeedback(enabled=False)
    fb.on_listening()
    fb.on_processing()
    fb.on_speaking()
    fb.close()


def test_feedback_unreachable_host_no_crash():
    fb = VisualFeedback(host="192.0.2.1", port=1, enabled=True)
    fb.on_listening()
    fb.on_processing()
    fb.on_speaking()
    fb.close()
