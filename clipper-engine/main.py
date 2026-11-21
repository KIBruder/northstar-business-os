from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("CLIPPER_DATA_DIR", APP_DIR / "data")).resolve()
MEDIA_DIR = DATA_DIR / "media"
DB_PATH = DATA_DIR / "clipper.sqlite3"
HOST = os.environ.get("CLIPPER_HOST", "127.0.0.1")
API_TOKEN = os.environ.get("CLIPPER_API_TOKEN", "")
MAX_UPLOAD_BYTES = int(os.environ.get("CLIPPER_MAX_UPLOAD_BYTES", str(100 * 1024**3)))
CHUNK_SIZE = 4 * 1024 * 1024

if HOST not in {"127.0.0.1", "localhost", "::1"} and len(API_TOKEN) < 32:
    raise RuntimeError("LAN binding requires CLIPPER_API_TOKEN with at least 32 characters")

app = FastAPI(title="CLIP-FINDER PRO Local Engine", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get("CLIPPER_ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Clipper-Token"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def init_db() -> None:
    with connect() as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, mode TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
          source_name TEXT NOT NULL, stored_name TEXT NOT NULL,
          path TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
          duration_seconds REAL, probe_json TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
        """)


@app.on_event("startup")
def startup() -> None:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    init_db()


def require_token(token: str | None) -> None:
    if API_TOKEN and token != API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid local engine token")


class ProjectInput(BaseModel):
    title: str
    mode: str = "clipper"


@app.get("/health")
def health() -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    ffmpeg = shutil.which("ffmpeg")
    return {
        "ok": True,
        "service": "clip-finder-pro-local-engine",
        "version": app.version,
        "ffmpeg_available": bool(ffmpeg),
        "ffprobe_available": bool(ffprobe),
        "storage_ready": DATA_DIR.exists(),
        "supported_modes": ["clipper", "movie-recap", "podcast"],
    }


@app.post("/api/projects")
def create_project(payload: ProjectInput, x_clipper_token: str | None = Header(default=None)) -> dict[str, str]:
    require_token(x_clipper_token)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Project title is required")
    if payload.mode not in {"clipper", "movie-recap", "podcast"}:
        raise HTTPException(status_code=422, detail="Unsupported production mode")
    project_id = str(uuid.uuid4())
    stamp = now_iso()
    with connect() as db:
        db.execute(
            "INSERT INTO projects(id,title,mode,created_at,updated_at) VALUES(?,?,?,?,?)",
            (project_id, title[:160], payload.mode, stamp, stamp),
        )
    return {"id": project_id, "title": title[:160], "mode": payload.mode, "created_at": stamp}


def probe_media(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise HTTPException(status_code=503, detail="ffprobe is not installed. Install FFmpeg and ensure ffprobe is on PATH.")
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=422, detail="The uploaded file is not a readable media file.")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="ffprobe returned invalid metadata.") from exc


@app.post("/api/projects/{project_id}/assets")
async def upload_asset(
    project_id: str,
    file: UploadFile = File(...),
    x_clipper_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(x_clipper_token)
    with connect() as db:
        project = db.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    source_name = Path(file.filename or "upload.bin").name[:240]
    asset_id = str(uuid.uuid4())
    stored_name = f"{asset_id}{Path(source_name).suffix.lower()[:12]}"
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    destination = MEDIA_DIR / stored_name
    digest = hashlib.sha256()
    total = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(CHUNK_SIZE):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Upload exceeds CLIPPER_MAX_UPLOAD_BYTES")
                digest.update(chunk)
                output.write(chunk)
        if total == 0:
            raise HTTPException(status_code=422, detail="Uploaded file is empty")
        metadata = probe_media(destination)
        duration = float(metadata.get("format", {}).get("duration") or 0) or None
        stamp = now_iso()
        with connect() as db:
            db.execute(
                """INSERT INTO assets
                (id,project_id,source_name,stored_name,path,size_bytes,sha256,duration_seconds,probe_json,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (asset_id, project_id, source_name, stored_name, str(destination), total,
                 digest.hexdigest(), duration, json.dumps(metadata), stamp),
            )
        return {
            "id": asset_id, "project_id": project_id, "source_name": source_name,
            "size_bytes": total, "sha256": digest.hexdigest(),
            "duration_seconds": duration, "probe": metadata, "created_at": stamp,
        }
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@app.get("/api/projects/{project_id}")
def get_project(project_id: str, x_clipper_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_clipper_token)
    with connect() as db:
        project = db.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        assets = db.execute(
            """SELECT id,source_name,size_bytes,sha256,duration_seconds,created_at
            FROM assets WHERE project_id=? ORDER BY created_at""", (project_id,)
        ).fetchall()
    return {"project": dict(project), "assets": [dict(row) for row in assets]}
