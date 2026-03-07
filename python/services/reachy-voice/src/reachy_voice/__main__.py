import sys

from reachy_voice.main import ReachyVoice, cli

if __name__ == "__main__":
    # Laptop mode: standalone CLI with sounddevice + pygame
    if "--mode" in sys.argv and "laptop" in sys.argv:
        cli()
    else:
        # Robot mode: daemon app (default when launched by AppManager)
        app = ReachyVoice()
        try:
            app.wrapped_run()
        except KeyboardInterrupt:
            app.stop()
