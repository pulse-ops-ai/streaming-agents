"""Tests for reachy_voice.session."""

import time

from reachy_voice.session import SessionManager


def test_session_id_is_uuid():
    mgr = SessionManager(timeout_s=60)
    sid = mgr.session_id
    assert len(sid) == 36  # UUID format
    assert sid.count("-") == 4


def test_session_persists_within_timeout():
    mgr = SessionManager(timeout_s=60)
    sid1 = mgr.session_id
    mgr.touch()
    sid2 = mgr.session_id
    assert sid1 == sid2


def test_session_resets_after_timeout():
    mgr = SessionManager(timeout_s=0.1)
    sid1 = mgr.session_id
    time.sleep(0.15)
    sid2 = mgr.session_id
    assert sid1 != sid2


def test_manual_reset():
    mgr = SessionManager(timeout_s=60)
    sid1 = mgr.session_id
    mgr.reset()
    sid2 = mgr.session_id
    assert sid1 != sid2


def test_touch_extends_session():
    mgr = SessionManager(timeout_s=0.2)
    sid1 = mgr.session_id
    time.sleep(0.1)
    mgr.touch()
    time.sleep(0.1)
    sid2 = mgr.session_id
    assert sid1 == sid2  # touch prevented timeout
