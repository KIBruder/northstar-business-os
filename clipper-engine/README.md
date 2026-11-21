# CLIP-FINDER PRO local engine (foundation)

This first backend slice provides a local health check, persistent projects, large-file streaming upload, SHA-256 fingerprints, and FFmpeg/ffprobe media inspection. It does **not** yet claim to detect highlights or render clips; those are the next P0 milestones.

## Requirements
- Python 3.11+
- FFmpeg including `ffmpeg` and `ffprobe` on PATH
- Free disk space for the source media and future exports

## Start (Windows PowerShell)
```powershell
cd clipper-engine
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:CLIPPER_DATA_DIR = "$PWD\data"
$env:CLIPPER_HOST = "127.0.0.1"\nuvicorn main:app --host $env:CLIPPER_HOST --port 8765
```

Open `http://127.0.0.1:8765/health`. For API docs open `http://127.0.0.1:8765/docs`.

## iPhone/LAN mode
Do not expose this service to a network without authentication. Set a random token of at least 32 characters in `CLIPPER_API_TOKEN`, then set `$env:CLIPPER_HOST = "0.0.0.0"`. Set `$env:CLIPPER_ALLOWED_ORIGINS` to the exact UI origin, for example `http://192.168.1.20:8000` (comma-separated allowlist). Send the token as `X-Clipper-Token`. Configure firewall access only for the trusted private LAN. HTTPS/reverse-proxy setup is required before use outside the LAN.

## API
- `GET /health`: engine and FFmpeg availability (no secret).
- `POST /api/projects`: JSON `{"title":"Stream Highlights","mode":"clipper"}`; modes: `clipper`, `movie-recap`, `podcast`.
- `POST /api/projects/{project_id}/assets`: multipart field `file`; streams the upload to disk, computes SHA-256, probes media metadata, and persists the asset.
- `GET /api/projects/{project_id}`: project and asset inventory.

The upload limit defaults to 100 GiB and can be changed with `CLIPPER_MAX_UPLOAD_BYTES`. Data is stored under `CLIPPER_DATA_DIR` (default: `clipper-engine/data`) and is git-ignored.

## Next implementation steps
1. Resumable/chunked uploads and durable job queue.
2. Scene/audio/transcript analysis and clip-candidate ranking.
3. FFmpeg batch render, audio-preserving output and export validation.
4. Podcast repurpose and hierarchical Movie Recap with local TTS.
