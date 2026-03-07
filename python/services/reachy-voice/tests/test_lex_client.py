"""Tests for reachy_voice.lex_client response decoding."""

import base64
import json

from reachy_voice.lex_client import LexResponse, _decode_field


def test_decode_base64_json_list():
    messages = [{"content": "All systems nominal.", "contentType": "PlainText"}]
    encoded = base64.b64encode(json.dumps(messages).encode()).decode()
    result = _decode_field(encoded)
    assert isinstance(result, list)
    assert result[0]["content"] == "All systems nominal."


def test_decode_base64_json_dict():
    state = {"intent": {"name": "FleetOverview", "state": "Fulfilled"}}
    encoded = base64.b64encode(json.dumps(state).encode()).decode()
    result = _decode_field(encoded)
    assert isinstance(result, dict)
    assert result["intent"]["name"] == "FleetOverview"


def test_decode_base64_string():
    text = "How is R-17?"
    encoded = base64.b64encode(json.dumps(text).encode()).decode()
    result = _decode_field(encoded)
    assert result == "How is R-17?"


def test_decode_none():
    assert _decode_field(None) is None


def test_decode_empty_string():
    assert _decode_field("") is None


def test_decode_plain_json_fallback():
    """If value is plain JSON (not base64), it should still parse."""
    plain = json.dumps({"key": "value"})
    result = _decode_field(plain)
    assert isinstance(result, dict)
    assert result["key"] == "value"


def test_lex_response_defaults():
    resp = LexResponse()
    assert resp.transcript is None
    assert resp.messages == []
    assert resp.audio_data is None
    assert resp.intent_name is None
    assert resp.session_state is None
