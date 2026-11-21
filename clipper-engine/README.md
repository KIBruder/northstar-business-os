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
Analysis and render requests are written to SQLite before the API responds. The worker claims the oldest queued job using a short `BEGIN IMMEDIATE` transaction, so multiple engine processes do not claim the same queued row. Job inputs are stored in `payload_json`; startup migrates existing databases and requeues interrupted jobs that have a payload. Old jobs without a stored payload are marked failed because they cannot be reconstructed safely. Analysis candidates and the completed state are committed together; export metadata and render completion are also committed together.

The queue is durable, but execution is **at-least-once**, not exactly-once. If the process stops during FFmpeg execution, the job is replayed after restart and rendering may run again. A separate supervised worker service, leases/heartbeats, retry limits and orphan-file cleanup are still future hardening work.

## Current limitations
- Transcript scoring uses transparent lexical and timing heuristics; it is not deep semantic or viral-moment classification.
- The model runs on the host CPU by default and may be slow on long recordings.
- Jobs are persisted in SQLite with replayable payloads. A background worker thread claims queued jobs atomically; after restart, interrupted jobs with payloads are requeued. Processing is at-least-once: a crash during an external FFmpeg operation can cause that operation to run again.
- Long-form (5–6 hour) media, actual FFmpeg rendering on the target host, and browser end-to-end behavior still require real-world validation.
