"""Entry points for reachy-voice: daemon app mode and laptop CLI mode."""

from __future__ import annotations

import argparse
import logging
import threading

from reachy_mini import ReachyMini, ReachyMiniApp

logger = logging.getLogger("reachy_voice")


# ---------------------------------------------------------------------------
# Daemon app mode — launched by the Reachy Mini AppManager
# ---------------------------------------------------------------------------


class ReachyVoice(ReachyMiniApp):
    """Reachy Mini daemon app: voice terminal for R-17 via Amazon Lex."""

    request_media_backend: str | None = "gstreamer_no_video"

    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event) -> None:
        from reachy_voice.audio_capture import AudioCapture
        from reachy_voice.audio_playback import AudioPlayer
        from reachy_voice.feedback import VisualFeedback
        from reachy_voice.lex_client import LexVoiceClient
        from reachy_voice.loop import VoiceLoop
        from reachy_voice.session import SessionManager

        _setup_logging("INFO")

        reachy_mini.media.start_recording()
        reachy_mini.media.start_playing()

        capture = AudioCapture(media=reachy_mini.media)
        player = AudioPlayer(media=reachy_mini.media)
        feedback = VisualFeedback(reachy_mini=reachy_mini)
        lex = LexVoiceClient()
        session = SessionManager()

        loop = VoiceLoop(
            capture=capture,
            player=player,
            lex=lex,
            session=session,
            feedback=feedback,
            stop_event=stop_event,
        )
        try:
            loop.run()
        finally:
            reachy_mini.media.stop_recording()
            reachy_mini.media.stop_playing()


# ---------------------------------------------------------------------------
# Laptop CLI mode — standalone for development / demo fallback
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="reachy-voice",
        description="Voice terminal for Reachy-Mini: talk to R-17 via Amazon Lex",
    )
    parser.add_argument(
        "--mode",
        default="robot",
        choices=["laptop", "robot"],
        help="Run mode (default: robot for daemon, laptop for standalone CLI)",
    )
    parser.add_argument(
        "--test-mic",
        action="store_true",
        help="Record 3 seconds from mic and play back through speaker",
    )
    parser.add_argument(
        "--test-lex",
        action="store_true",
        help="Record one utterance, send to Lex, play response",
    )
    parser.add_argument(
        "--press-to-talk",
        action="store_true",
        help="Wait for Enter keypress before recording (default: always-listen)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Set log level (default: INFO)",
    )
    return parser.parse_args(argv)


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _test_mic_laptop() -> None:
    """Record and playback test using sounddevice + pygame."""
    from reachy_voice.audio_capture import AudioCapture
    from reachy_voice.audio_playback import AudioPlayer

    capture = AudioCapture()
    player = AudioPlayer()

    try:
        print("Recording 3 seconds from microphone...")
        pcm = capture.test_record(duration_s=3.0)
        print(f"Captured {len(pcm)} bytes. Playing back...")
        player.play_pcm(pcm)
        print("Done.")
    finally:
        capture.close()
        player.close()


def _test_lex_laptop() -> None:
    """Single utterance Lex test using sounddevice."""
    from reachy_voice.audio_capture import AudioCapture
    from reachy_voice.audio_playback import AudioPlayer
    from reachy_voice.lex_client import LexVoiceClient
    from reachy_voice.session import SessionManager

    capture = AudioCapture()
    player = AudioPlayer()
    lex = LexVoiceClient()
    session = SessionManager()

    try:
        print("Speak now (recording until silence)...")
        audio = capture.record_utterance()
        if audio is None:
            print("No speech detected.")
            return

        print(f"Sending {len(audio)} bytes to Lex...")
        response = lex.recognize(audio, session.session_id)

        if response.transcript:
            print(f"Lex heard: {response.transcript}")
        if response.intent_name:
            print(f"Intent: {response.intent_name}")
        for msg in response.messages:
            if isinstance(msg, dict):
                print(f"Response: {msg.get('content', '')}")

        if response.audio_data:
            print("Playing audio response...")
            player.play_mp3(response.audio_data)
        else:
            print("No audio in response.")
    finally:
        capture.close()
        player.close()


def _run_loop_laptop(*, press_to_talk: bool) -> None:
    """Start continuous voice loop using sounddevice + pygame."""
    from reachy_voice.audio_capture import AudioCapture
    from reachy_voice.audio_playback import AudioPlayer
    from reachy_voice.feedback import VisualFeedback
    from reachy_voice.lex_client import LexVoiceClient
    from reachy_voice.loop import VoiceLoop
    from reachy_voice.session import SessionManager

    stop_event = threading.Event()

    capture = AudioCapture()
    player = AudioPlayer()
    feedback = VisualFeedback()  # no reachy_mini → disabled
    lex = LexVoiceClient()
    session = SessionManager()

    loop = VoiceLoop(
        capture=capture,
        player=player,
        lex=lex,
        session=session,
        feedback=feedback,
        press_to_talk=press_to_talk,
        stop_event=stop_event,
    )
    try:
        loop.run()
    except KeyboardInterrupt:
        logger.info("Interrupted")
        stop_event.set()


def cli(argv: list[str] | None = None) -> None:
    """Laptop-mode CLI entry point."""
    args = _parse_args(argv)
    _setup_logging(args.log_level)

    if args.test_mic:
        _test_mic_laptop()
    elif args.test_lex:
        _test_lex_laptop()
    else:
        _run_loop_laptop(press_to_talk=args.press_to_talk)


if __name__ == "__main__":
    # Launched by daemon AppManager: python -m reachy_voice.main
    # The cli() path is only reached via the "reachy-voice" console script.
    app = ReachyVoice()
    try:
        app.wrapped_run()
    except KeyboardInterrupt:
        app.stop()
