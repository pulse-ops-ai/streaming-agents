"""Main voice loop: listen -> send to Lex -> play response -> repeat."""

from __future__ import annotations

import logging
import signal

from reachy_voice.audio_capture import AudioCapture
from reachy_voice.audio_playback import AudioPlayer
from reachy_voice.feedback import VisualFeedback
from reachy_voice.lex_client import LexVoiceClient
from reachy_voice.session import SessionManager

logger = logging.getLogger(__name__)


class VoiceLoop:
    """Orchestrates the continuous voice interaction loop."""

    def __init__(
        self,
        *,
        capture: AudioCapture,
        player: AudioPlayer,
        lex: LexVoiceClient,
        session: SessionManager,
        feedback: VisualFeedback,
        press_to_talk: bool = False,
    ) -> None:
        self._capture = capture
        self._player = player
        self._lex = lex
        self._session = session
        self._feedback = feedback
        self._press_to_talk = press_to_talk
        self._running = True

        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _handle_signal(self, signum: int, frame: object) -> None:
        logger.info("Shutdown signal received")
        self._running = False

    def run(self) -> None:
        """Run continuous voice loop until interrupted."""
        mode_msg = "Press Enter to speak." if self._press_to_talk else "Listening..."
        logger.info("Voice terminal active. %s", mode_msg)
        try:
            while self._running:
                self._cycle()
        finally:
            self._feedback.close()
            self._capture.close()
            self._player.close()
            logger.info("Voice terminal stopped")

    def run_once(self) -> None:
        """Run a single listen-respond cycle."""
        try:
            self._cycle()
        finally:
            self._feedback.close()
            self._capture.close()
            self._player.close()

    def _cycle(self) -> None:
        """Single listen -> process -> respond cycle."""
        # Wait for trigger in press-to-talk mode
        if self._press_to_talk:
            try:
                input("Press Enter to speak... ")
            except EOFError:
                self._running = False
                return

        # Listen
        self._feedback.on_listening()
        audio = self._capture.record_utterance()

        if audio is None:
            if not self._press_to_talk:
                # In always-listen mode, just continue silently
                return
            print("No speech detected. Try again.")
            return

        # Process
        self._feedback.on_processing()
        session_id = self._session.session_id

        logger.info("Sending %d bytes to Lex (session=%s)", len(audio), session_id[:8])
        response = self._lex.recognize(audio, session_id)
        self._session.touch()

        # Log what Lex heard
        if response.transcript:
            logger.info("Lex heard: %s", response.transcript)
            print(f"You: {response.transcript}")

        if response.intent_name:
            logger.info("Intent: %s", response.intent_name)

        # Extract response text
        response_text = None
        for msg in response.messages:
            if isinstance(msg, dict):
                content = msg.get("content", "")
                if msg.get("contentType") == "PlainText" or not response_text:
                    response_text = content

        if response_text:
            print(f"R-17: {response_text}")

        # Speak
        if response.audio_data:
            self._feedback.on_speaking()
            self._player.play_mp3(response.audio_data)
        elif response_text:
            logger.warning("No audio in response, text only: %s", response_text)

        if not response.transcript and not response.messages:
            logger.warning("Lex returned empty response — mic may not have captured speech clearly")
