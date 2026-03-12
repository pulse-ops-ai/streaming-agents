# Reachy Voice — Deployment & Operations

The reachy-voice service provides the voice copilot interface on the Reachy Mini robot. It captures speech from the robot's microphone array, sends it to Amazon Lex for intent recognition, and plays back Polly TTS responses through the robot's speaker.

## Architecture

```
Reachy Mini Microphone (4-mic array)
  └── SDK: get_audio_sample() → float32 PCM
        │
        ▼
  reachy-voice (daemon app)
  ├── VAD: energy-based silence detection
  ├── Lex: recognize_utterance (PCM → intent)
  ├── Lambda: conversation-agent (Bedrock)
  └── Polly: TTS → MP3
        │
        ▼
  ffmpeg decode MP3 → float32 → SDK push_audio_sample()
        │
        ▼
  Reachy Mini Speaker
```

The voice service runs as a **Reachy Mini daemon app** — it's managed by the daemon's AppManager and uses the SDK for audio I/O.

## Deployment

### Prerequisites

- SSH access to the robot: `ssh pollen@reachy-mini.local`
- AWS credentials configured on the Pi
- The reachy_mini daemon running (`--wireless-version`)
- `ffmpeg` installed (for MP3 decoding)

### Install / Update

The voice service installs into the daemon's app venv so it can be discovered as a daemon app. Use the Taskfile tasks from your development machine:

```bash
# First-time install (resolves dependencies)
task deploy:voice

# Code-only update (skips dependency resolution — faster)
task deploy:voice:update
```

Both tasks copy the source and `pyproject.toml` to the Pi, then install into `/venvs/apps_venv/`. After installing, restart the daemon to pick up the new app:

```bash
ssh pollen@reachy-mini.local 'sudo systemctl restart reachy-mini'
```

> **`deploy:voice` vs `deploy:voice:update`:** Use `deploy:voice` when dependencies in `pyproject.toml` have changed. Use `deploy:voice:update` for code-only changes — it runs `pip install --force-reinstall --no-deps` which skips dependency resolution and is significantly faster.

### How It Runs

Unlike the exporter, reachy-voice is a `ReachyMiniApp`. The daemon discovers it automatically and manages its lifecycle. You do NOT create a separate systemd service.

The daemon process runs as:
```
python -u -m reachy_mini.daemon.app.main --wireless-version --no-autostart
```

The voice app can be started/stopped from the Reachy dashboard or via the daemon REST API.

## Configuration

All configuration is via environment variables. These must be set in the daemon's environment (or the daemon's systemd unit):

| Variable | Default | Description |
|----------|---------|-------------|
| `LEX_BOT_ID` | (from config) | Lex V2 Bot ID |
| `LEX_BOT_ALIAS_ID` | (from config) | Lex V2 Bot Alias ID |
| `LEX_LOCALE_ID` | `en_US` | Lex locale |
| `AWS_REGION` | `us-east-1` | AWS region |
| `VOICE_MODE` | `robot` | `robot` (SDK audio) or `laptop` (sounddevice/pygame) |
| `SILENCE_THRESHOLD` | `0.09` | VAD silence threshold (float32 amplitude, 0.0-1.0) |
| `SILENCE_DURATION_S` | `1.5` | Seconds of silence to end recording |
| `MAX_RECORD_S` | `10` | Maximum recording length |
| `MIN_RECORD_S` | `0.5` | Minimum recording length (discard shorter) |
| `SESSION_TIMEOUT_S` | `60` | Lex session timeout |
| `ENABLE_VISUAL_FEEDBACK` | `true` | Head nod/shake feedback during interactions |

### VAD Tuning

The silence threshold of `0.09` was calibrated for Reachy Mini's motor noise floor (0.013-0.045 RMS ambient). If the robot isn't detecting speech or is triggering on noise, adjust `SILENCE_THRESHOLD`:

- Too many false triggers → increase threshold (e.g., `0.12`)
- Not detecting quiet speech → decrease threshold (e.g., `0.06`)

## Checking Logs

Voice logs appear in the daemon's journal:

```bash
# Follow daemon logs (includes voice app output)
journalctl -u reachy-mini -f

# Filter for voice-specific output
journalctl -u reachy-mini -f | grep -i "voice\|lex\|polly\|audio\|speech"

# Last 100 lines of daemon output
journalctl -u reachy-mini -n 100
```

### Healthy Voice Interaction

```
[INFO] Audio player ready (SDK)
[INFO] Listening...
[INFO] Speech detected, recording...
[INFO] Recording complete: 2.3s, 36800 bytes
[INFO] Lex response: FleetOverview (InputTranscript: "how's the fleet looking")
[INFO] Decoding 8432 bytes MP3 via ffmpeg for SDK playback
[INFO] Pushing 24000 samples (1.5s) to SDK audio sink
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `No Reachy Mini Audio Sink card found` | Expected warning on wireless model | Benign — audio still works |
| `DependencyFailedException` | Lambda returned error | Check Lambda logs in CloudWatch/Grafana |
| `InvalidSsmlException` | SSML tag not supported by Polly neural | Use `<prosody>` not `<emphasis>` |
| Lex transcribes "fleet" as "league" | ASR confusion | More FleetOverview utterances in Lex config |
| No audio playback | ffmpeg not installed | `sudo apt install ffmpeg` |
| Recording too short / too long | VAD threshold miscalibrated | Adjust `SILENCE_THRESHOLD` |

## Laptop Mode

For development without robot hardware:

```bash
cd python/services/reachy-voice
VOICE_MODE=laptop python -m reachy_voice.main

# Test microphone only
python -m reachy_voice.main --test-mic

# Test Lex round-trip only
python -m reachy_voice.main --test-lex
```

Laptop mode uses `sounddevice` for capture and `pygame`/`mpv`/`ffplay` for playback.

## Audio Pipeline Details

### Capture (Robot Mode)
- SDK `get_audio_sample()` returns float32 chunks at 16kHz
- Energy-based VAD detects speech start/end
- PCM int16 mono sent to Lex `recognize_utterance`

### Playback (Robot Mode)
1. Lex returns Polly MP3 audio (gzip-compressed + base64-encoded in response)
2. `ffmpeg` decodes MP3 → float32 PCM at 16kHz mono
3. SDK `push_audio_sample()` plays through the robot's speaker
4. Sleep for audio duration to prevent overlap

### Response Decoding
Lex response fields (`messages`, `interpretations`) are gzip-compressed and base64-encoded. Check for the `1f8b` magic bytes (gzip header) before decoding.

## See Also

- [Reachy Mini SDK Reference](../../05-dev/reachy-mini-sdk-reference.md) — REST API endpoints, IMU access, hardware profile
- [Reachy Exporter](../reachy-exporter/) — telemetry sidecar running alongside the voice service
