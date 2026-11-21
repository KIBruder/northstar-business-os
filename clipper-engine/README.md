# CLIP-FINDER PRO local engine

The local engine supports project/media intake, candidate analysis, and FFmpeg clip rendering. Its analysis has two levels:

- **Base mode:** one-second audio RMS/dynamics plus FFmpeg scene-change timestamps.
- **Optional transcript mode:** local speech-to-text with faster-whisper, adding speech coverage, word density, selected emphasis terms, punctuation cues, and a transcript excerpt to candidate ranking.

Transcript scoring is a lightweight heuristic over recognized words, not a general-purpose semantic understanding model. It does not claim to detect humor, factual importance, or a viral moment reliably. If faster-whisper is not installed, analysis automatically uses base mode.

## Requirements
- Python 3.11+
- FFmpeg including `ffmpeg` and `ffprobe` on PATH
- Free disk space for source media and exports

## Start (Windows PowerShell)
```powershell
cd clipper-engine
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:CLIPPER_DATA_DIR = "$PWD\data"
$env:CLIPPER_HOST = "127.0.0.1"
uvicorn main:app --host $env:CLIPPER_HOST --port 8765
```

## Enable local transcript analysis
Install the optional dependency set:
```powershell
pip install -r requirements-ai.txt
```
The first transcription run downloads the configured Whisper model. Default: `small`, CPU, int8. Configure before starting the server:
```powershell
$env:CLIPPER_WHISPER_MODEL = "small"
# Optional: force language, e.g. "de" or "en". Leave unset for language detection.
$env:CLIPPER_WHISPER_LANGUAGE = "de"
```
For an initial iPhone-connected test, the host computer must run the engine; the iPhone is the control surface, not the compute device. Model downloads and inference happen on the host. The small model is a practical starting point; larger models need more RAM and processing time.

## iPhone/LAN mode
Do not expose this service to a network without authentication. Set a random token of at least 32 characters in `CLIPPER_API_TOKEN`, then set `CLIPPER_HOST = "0.0.0.0"`. Set `CLIPPER_ALLOWED_ORIGINS` to the exact UI origin, for example `http://192.168.1.20:8000` (comma-separated allowlist). Send the token as `X-Clipper-Token`. Configure firewall access only for the trusted private LAN. HTTPS/reverse-proxy setup is required before use outside the LAN.

## API
- `GET /health`: engine and FFmpeg availability.
- `POST /api/projects`: create a project; modes: `clipper`, `movie-recap`, `podcast`.
- `POST /api/projects/{project_id}/assets`: upload media and inspect metadata.
- `GET /api/projects/{project_id}`: project and asset inventory.
- `POST /api/projects/{project_id}/analyze`: JSON `{ "clip_seconds": 60, "clip_count": 5 }`.
- `GET /api/jobs/{job_id}`: job state and progress.
- `GET /api/projects/{project_id}/candidates`: ranked candidates, reasons, and optional transcript excerpts.
- `POST /api/projects/{project_id}/candidates/{candidate_id}/render`: JSON `{ "aspect_ratio": "9:16", "quality": 1080 }`.
- `GET /api/exports/{export_id}/download`: authenticated MP4 download.

## Persistent job queue
Analysis and render requests are written to SQLite before the API responds. The worker claims the oldest queued job using a short `BEGIN IMMEDIATE` transaction. Each claim increments `attempt_count` and establishes a renewable lease (`lease_owner`, `lease_expires_at`). A heartbeat thread renews the lease while analysis or FFmpeg rendering is active. Startup and the worker loop recover only expired leases; active leases are left untouched. Expired jobs are requeued until `max_attempts` is reached (default 3), after which they become failed. Jobs without replayable payloads are marked failed. Existing databases are migrated automatically.

Configure `CLIPPER_WORKER_LEASE_SECONDS` (default 90), `CLIPPER_MAX_JOB_ATTEMPTS` (default 3), and `CLIPPER_QUEUE_POLL_SECONDS` to tune the worker. Run one Uvicorn process for now: the SQLite claim is atomic, but the worker lifecycle is still in-process and has not yet been validated as a multi-process deployment. Analysis candidates and the completed state are committed together; export metadata and render completion are also committed together.

Execution remains **at-least-once**, not exactly-once. A crash during an external FFmpeg operation can cause it to run again. The in-process heartbeat protects long jobs from false lease expiry, but a separately supervised worker service, orphan-file cleanup and production crash testing remain future hardening work.

## Current limitations
- Transcript scoring uses transparent lexical and timing heuristics; it is not deep semantic or viral-moment classification.
- The model runs on the host CPU by default and may be slow on long recordings.
- Jobs are persisted in SQLite with replayable payloads, renewable worker leases and bounded recovery attempts. Only expired leases are recovered; active jobs renew their lease by heartbeat. Processing is at-least-once: a crash during an external FFmpeg operation can cause that operation to run again.
- Long-form (5–6 hour) media, actual FFmpeg rendering on the target host, and browser end-to-end behavior still require real-world validation.
