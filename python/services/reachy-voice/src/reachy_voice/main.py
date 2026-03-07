"""CLI entry point for the reachy-voice terminal."""

from __future__ import annotations

import argparse
import logging

logger = logging.getLogger("reachy_voice")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="reachy-voice",
        description="Voice terminal for Reachy-Mini: talk to R-17 via Amazon Lex",
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


def _test_mic() -> None:
    """Record and playback test."""
    from reachy_mini import ReachyMini

    from reachy_voice.audio_capture import AudioCapture
    from reachy_voice.audio_playback import AudioPlayer
    from reachy_voice.config import REACHY_MEDIA_BACKEND

    with ReachyMini(media_backend=REACHY_MEDIA_BACKEND) as mini:
        capture = AudioCapture(media=mini.media)
        player = AudioPlayer(media=mini.media)

        try:
            print("Recording 3 seconds from microphone...")
            pcm = capture.test_record(duration_s=3.0)
            print(f"Captured {len(pcm)} bytes. Playing back...")
            player.play_pcm(pcm)
            print("Done.")
        finally:
            capture.close()
            player.close()


def _test_lex() -> None:
    """Single utterance Lex test."""
    from reachy_mini import ReachyMini

    from reachy_voice.audio_capture import AudioCapture
    from reachy_voice.audio_playback import AudioPlayer
    from reachy_voice.config import REACHY_MEDIA_BACKEND
    from reachy_voice.lex_client import LexVoiceClient
    from reachy_voice.session import SessionManager

    with ReachyMini(media_backend=REACHY_MEDIA_BACKEND) as mini:
        capture = AudioCapture(media=mini.media)
        player = AudioPlayer(media=mini.media)
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


def _run_loop(press_to_talk: bool) -> None:
    """Start continuous voice loop."""
    from reachy_mini import ReachyMini

    from reachy_voice.audio_capture import AudioCapture
    from reachy_voice.audio_playback import AudioPlayer
    from reachy_voice.config import REACHY_MEDIA_BACKEND
    from reachy_voice.feedback import VisualFeedback
    from reachy_voice.lex_client import LexVoiceClient
    from reachy_voice.loop import VoiceLoop
    from reachy_voice.session import SessionManager

    with ReachyMini(media_backend=REACHY_MEDIA_BACKEND) as mini:
        capture = AudioCapture(media=mini.media)
        player = AudioPlayer(media=mini.media)
        lex = LexVoiceClient()
        session = SessionManager()
        feedback = VisualFeedback()

        loop = VoiceLoop(
            capture=capture,
            player=player,
            lex=lex,
            session=session,
            feedback=feedback,
            press_to_talk=press_to_talk,
        )
        loop.run()


def cli(argv: list[str] | None = None) -> None:
    """CLI entry point."""
    args = _parse_args(argv)
    _setup_logging(args.log_level)

    if args.test_mic:
        _test_mic()
    elif args.test_lex:
        _test_lex()
    else:
        _run_loop(press_to_talk=args.press_to_talk)


if __name__ == "__main__":
    cli()
