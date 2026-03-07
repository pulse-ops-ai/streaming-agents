"""Amazon Lex V2 Runtime client for voice interaction."""

from __future__ import annotations

import base64
import gzip
import json
import logging
from dataclasses import dataclass, field

import boto3

from reachy_voice.config import (
    AWS_REGION,
    LEX_BOT_ALIAS_ID,
    LEX_BOT_ID,
    LEX_LOCALE_ID,
    SAMPLE_RATE,
)

logger = logging.getLogger(__name__)


@dataclass
class LexResponse:
    """Parsed response from Lex recognize_utterance."""

    transcript: str | None = None
    messages: list[dict] = field(default_factory=list)
    audio_data: bytes | None = None
    intent_name: str | None = None
    session_state: dict | None = None


def _decode_field(value: str | None) -> object:
    """Decode a base64-encoded (possibly gzip-compressed) JSON field from Lex."""
    if not value:
        return None
    try:
        raw = base64.b64decode(value)
        # Lex may gzip-compress response fields (magic bytes 1f 8b)
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return json.loads(raw)
    except Exception:
        try:
            return json.loads(value)
        except Exception:
            return value


class LexVoiceClient:
    """Sends audio to Lex V2 and returns the response."""

    def __init__(
        self,
        *,
        bot_id: str = LEX_BOT_ID,
        bot_alias_id: str = LEX_BOT_ALIAS_ID,
        locale_id: str = LEX_LOCALE_ID,
        region: str = AWS_REGION,
    ) -> None:
        self._bot_id = bot_id
        self._bot_alias_id = bot_alias_id
        self._locale_id = locale_id
        self._client = boto3.client("lexv2-runtime", region_name=region)

    def recognize(self, audio: bytes, session_id: str) -> LexResponse:
        """Send audio to Lex and return parsed response.

        Args:
            audio: Raw PCM bytes (16-bit signed, mono, 16kHz).
            session_id: Conversation session ID.

        Returns:
            LexResponse with transcript, messages, audio, and intent info.
        """
        try:
            response = self._client.recognize_utterance(
                botId=self._bot_id,
                botAliasId=self._bot_alias_id,
                localeId=self._locale_id,
                sessionId=session_id,
                requestContentType=f"audio/l16; rate={SAMPLE_RATE}; channels=1",
                responseContentType="audio/mpeg",
                inputStream=audio,
            )
        except Exception:
            logger.exception("Lex recognize_utterance failed")
            return LexResponse()

        result = LexResponse()

        # Decode transcript
        transcript_raw = response.get("inputTranscript")
        if transcript_raw:
            decoded = _decode_field(transcript_raw)
            result.transcript = str(decoded) if decoded else None

        # Decode messages
        messages_raw = response.get("messages")
        if messages_raw:
            decoded = _decode_field(messages_raw)
            if isinstance(decoded, list):
                result.messages = decoded
            elif isinstance(decoded, str):
                result.messages = [{"content": decoded, "contentType": "PlainText"}]

        # Decode session state for intent name
        session_raw = response.get("sessionState")
        if session_raw:
            session_state = _decode_field(session_raw)
            if isinstance(session_state, dict):
                result.session_state = session_state
                intent = session_state.get("intent", {})
                result.intent_name = intent.get("name")

        # Read audio stream
        audio_stream = response.get("audioStream")
        if audio_stream:
            try:
                result.audio_data = audio_stream.read()
            except Exception:
                logger.exception("Failed to read audio stream")

        return result
