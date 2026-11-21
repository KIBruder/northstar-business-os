from __future__ import annotations

import hashlib
from contextlib import contextmanager
import json
import os
import shutil
import sqlite3
import subprocess
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse

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


@contextmanager
def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


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
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL, error TEXT, result_json TEXT, payload_json TEXT, lease_owner TEXT, lease_expires_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
        CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, project_id TEXT NOT NULL, asset_id TEXT NOT NULL, start_seconds REAL NOT NULL, end_seconds REAL NOT NULL, score REAL NOT NULL, reasons_json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_candidates_job ON candidates(job_id);
        CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, candidate_id TEXT NOT NULL, path TEXT NOT NULL, duration_seconds REAL NOT NULL, aspect_ratio TEXT NOT NULL, resolution TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_exports_project ON exports(project_id);
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(jobs)").fetchall()}
        migrations = {
            "payload_json": "TEXT",
            "lease_owner": "TEXT",
            "lease_expires_at": "TEXT",
            "attempt_count": "INTEGER NOT NULL DEFAULT 0",
            "max_attempts": "INTEGER NOT NULL DEFAULT 3",
        }
        for name, definition in migrations.items():
            if name not in columns:
                db.execute(f"ALTER TABLE jobs ADD COLUMN {name} {definition}")
        db.execute("CREATE INDEX IF NOT EXISTS idx_jobs_lease ON jobs(status,lease_expires_at)")


worker_thread: threading.Thread | None = None
worker_stop = threading.Event()


LEASE_SECONDS = int(os.environ.get("CLIPPER_WORKER_LEASE_SECONDS", "90"))
HEARTBEAT_SECONDS = max(5, min(30, LEASE_SECONDS // 3))
MAX_JOB_ATTEMPTS = max(1, int(os.environ.get("CLIPPER_MAX_JOB_ATTEMPTS", "3")))


def recover_interrupted_jobs() -> None:
    """Recover only expired leases; active workers retain their jobs across app restarts."""
    stamp = now_iso()
    with connect() as db:
        db.execute(
            """UPDATE jobs SET status='failed',stage='Nicht wiederherstellbarer Alt-Job',
               error='Dieser Job besitzt keine gespeicherten Auftragsdaten und kann nicht wiederhergestellt werden.',
               lease_owner=NULL,lease_expires_at=NULL,updated_at=?
               WHERE status IN ('queued','running') AND payload_json IS NULL""", (stamp,),
        )
        db.execute(
            """UPDATE jobs SET status=CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END,
               progress=CASE WHEN attempt_count >= max_attempts THEN progress ELSE 0 END,
               stage=CASE WHEN attempt_count >= max_attempts THEN 'Wiederholungsgrenze erreicht' ELSE 'Abgelaufener Worker-Lease – erneut eingereiht' END,
               error=CASE WHEN attempt_count >= max_attempts THEN 'Maximale Anzahl an Wiederherstellungsversuchen erreicht.' ELSE NULL END,
               lease_owner=NULL,lease_expires_at=NULL,updated_at=?
               WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at <= ?) AND payload_json IS NOT NULL""",
            (stamp, stamp),
        )


def claim_next_job(worker_id: str) -> dict[str, Any] | None:
    """Atomically claim a queued job and establish a renewable lease."""
    stamp = now_iso()
    expires = (datetime.now(timezone.utc) + timedelta(seconds=LEASE_SECONDS)).isoformat()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT * FROM jobs WHERE status='queued' AND payload_json IS NOT NULL AND attempt_count < max_attempts ORDER BY created_at,id LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        changed = db.execute(
            """UPDATE jobs SET status='running',progress=1,stage='Worker hat Auftrag übernommen',
               lease_owner=?,lease_expires_at=?,attempt_count=attempt_count+1,updated_at=?
               WHERE id=? AND status='queued'""",
            (worker_id, expires, stamp, row["id"]),
        ).rowcount
        if changed != 1:
            return None
        claimed = db.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone()
        return dict(claimed)


def heartbeat_job(job_id: str, worker_id: str) -> bool:
    expires = (datetime.now(timezone.utc) + __import__('datetime').timedelta(seconds=LEASE_SECONDS)).isoformat()
    with connect() as db:
        changed = db.execute(
            "UPDATE jobs SET lease_expires_at=?,updated_at=? WHERE id=? AND status='running' AND lease_owner=?",
            (expires, now_iso(), job_id, worker_id),
        ).rowcount
    return changed == 1


def cleanup_orphan_workdirs(min_age_hours: int = 24) -> int:
    """Remove only stale work directories belonging to terminal or missing jobs."""
    work_root = DATA_DIR / "work"
    if not work_root.is_dir():
        return 0
    cutoff = datetime.now(timezone.utc).timestamp() - max(1, min_age_hours) * 3600
    removed = 0
    for directory in work_root.iterdir():
        if not directory.is_dir():
            continue
        try:
            if directory.stat().st_mtime > cutoff:
                continue
            with connect() as db:
                job = db.execute("SELECT status FROM jobs WHERE id=?", (directory.name,)).fetchone()
            if job and job["status"] not in {"completed", "failed"}:
                continue
            shutil.rmtree(directory)
            removed += 1
        except FileNotFoundError:
            continue
        except OSError:
            # Cleanup is best-effort and must never interrupt media processing.
            continue
    return removed


def dispatch_job(job: dict[str, Any]) -> None:
    payload = json.loads(job["payload_json"] or "{}")
    if job["kind"] == "analysis":
        run_analysis_job(job["id"], job["project_id"], payload["asset_id"], payload["source_path"], payload["settings"])
    elif job["kind"] == "render":
        run_render_job(job["id"], job["project_id"], payload["candidate_id"], payload["source_path"], payload["candidate"], payload["settings"])
    elif job["kind"] == "batch_render":
        run_batch_render_job(job["id"], job["project_id"], payload["items"], payload["settings"])
    else:
        update_job(job["id"], "failed", 100, "Unbekannter Auftragstyp", error=f"Unsupported job kind: {job['kind']}")


def worker_loop() -> None:
    worker_id = str(uuid.uuid4())
    last_recovery = 0.0
    while not worker_stop.is_set():
        job = None
        try:
            import time
            if time.monotonic() - last_recovery >= 10:
                recover_interrupted_jobs()
                cleanup_orphan_workdirs()
                last_recovery = time.monotonic()
            job = claim_next_job(worker_id)
            if job:
                heartbeat_stop = threading.Event()
                def heartbeat_loop() -> None:
                    while not heartbeat_stop.wait(HEARTBEAT_SECONDS):
                        if not heartbeat_job(job["id"], worker_id):
                            break
                heartbeat = threading.Thread(target=heartbeat_loop, name=f"clipper-heartbeat-{job['id'][:8]}", daemon=True)
                heartbeat.start()
                try:
                    dispatch_job(job)
                finally:
                    heartbeat_stop.set()
                    heartbeat.join(timeout=HEARTBEAT_SECONDS + 1)
                    with connect() as db:
                        db.execute("UPDATE jobs SET lease_owner=NULL,lease_expires_at=NULL WHERE id=? AND lease_owner=?", (job["id"], worker_id))
                continue
        except Exception as exc:
            if job:
                with connect() as db:
                    db.execute("UPDATE jobs SET status='failed',progress=100,stage='Worker-Fehler',error=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND lease_owner=?", (str(exc)[:2000], now_iso(), job["id"], worker_id))
        worker_stop.wait(float(os.environ.get("CLIPPER_QUEUE_POLL_SECONDS", "1.0")))


@app.on_event("startup")
def startup() -> None:
    global worker_thread
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    recover_interrupted_jobs()
    worker_stop.clear()
    if worker_thread is None or not worker_thread.is_alive():
        worker_thread = threading.Thread(target=worker_loop, name="clipper-sqlite-worker", daemon=True)
        worker_thread.start()


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
    try:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
            capture_output=True, text=True, timeout=180,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Media inspection timed out after 180 seconds.") from exc
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


class AnalyzeInput(BaseModel):
    clip_seconds: int = Field(default=60, ge=10, le=600)
    clip_count: int = Field(default=5, ge=0, le=100)


class RenderInput(BaseModel):
    aspect_ratio: str = "9:16"
    quality: int = Field(default=1080, ge=720, le=1080)
    framing: str = Field(default="crop", pattern="^(crop|blur|face)$")


def update_job(job_id: str, status: str, progress: int, stage: str, error: str | None = None, result: dict[str, Any] | None = None) -> None:
    with connect() as db:
        db.execute("UPDATE jobs SET status=?,progress=?,stage=?,error=?,result_json=?,lease_owner=CASE WHEN ? IN ('completed','failed') THEN NULL ELSE lease_owner END,lease_expires_at=CASE WHEN ? IN ('completed','failed') THEN NULL ELSE lease_expires_at END,updated_at=? WHERE id=?",
                   (status, progress, stage, error, json.dumps(result) if result is not None else None, status, status, now_iso(), job_id))


def run_analysis_job(job_id: str, project_id: str, asset_id: str, source_path: str, settings: dict[str, Any]) -> None:
    from pipeline import analyze
    try:
        update_job(job_id, "running", 5, "Audio wird analysiert")
        with connect() as db:
            asset = db.execute("SELECT source_name FROM assets WHERE id=?", (asset_id,)).fetchone()
        if not asset:
            raise RuntimeError("Quellmedium wurde nicht gefunden.")
        work = DATA_DIR / "work" / job_id
        candidates = analyze(Path(source_path), work, settings["clip_seconds"], settings["clip_count"], project_id)
        result_payload = {"candidate_count": len(candidates), "method": "audio + scene + optional local transcript heuristic", "note": "Transkriptbewertung ist eine transparente Heuristik und keine zuverlässige semantische Viral-Moment-Erkennung."}
        with connect() as db:
            db.execute("DELETE FROM candidates WHERE job_id=?", (job_id,))
            for item in candidates:
                db.execute("INSERT INTO candidates(id,job_id,project_id,asset_id,start_seconds,end_seconds,score,reasons_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                           (item["id"], job_id, project_id, asset_id, item["start_seconds"], item["end_seconds"], item["score"], json.dumps(item["reasons"]), now_iso()))
            db.execute("UPDATE jobs SET status='completed',progress=100,stage='Analyse abgeschlossen',error=NULL,result_json=?,updated_at=? WHERE id=?",
                       (json.dumps(result_payload), now_iso(), job_id))
    except Exception as exc:
        update_job(job_id, "failed", 100, "Analyse fehlgeschlagen", error=str(exc)[:2000])


@app.post("/api/projects/{project_id}/analyze")
def start_analysis(project_id: str, payload: AnalyzeInput, x_clipper_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_clipper_token)
    with connect() as db:
        asset = db.execute("SELECT * FROM assets WHERE project_id=? ORDER BY created_at DESC LIMIT 1", (project_id,)).fetchone()
        if not asset:
            raise HTTPException(status_code=404, detail="Project has no uploaded media")
        active = db.execute("SELECT id FROM jobs WHERE project_id=? AND kind='analysis' AND status IN ('queued','running')", (project_id,)).fetchone()
        if active:
            raise HTTPException(status_code=409, detail="An analysis job is already running for this project")
        job_id = str(uuid.uuid4())
        stamp = now_iso()
        job_payload = {"asset_id": asset["id"], "source_path": asset["path"], "settings": payload.model_dump()}
        db.execute("INSERT INTO jobs(id,project_id,kind,status,progress,stage,payload_json,created_at,updated_at) VALUES(?,?,?,'queued',0,'Warteschlange',?,?,?)",
                   (job_id, project_id, "analysis", json.dumps(job_payload), stamp, stamp))
    return {"job_id": job_id, "status": "queued", "stage": "Warteschlange"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, x_clipper_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_clipper_token)
    with connect() as db:
        job = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    result = dict(job)
    result["result"] = json.loads(result.pop("result_json")) if result.get("result_json") else None
    return result


@app.get("/api/projects/{project_id}/candidates")
def list_candidates(project_id: str, x_clipper_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_clipper_token)
    with connect() as db:
        rows = db.execute("SELECT * FROM candidates WHERE project_id=? ORDER BY score DESC", (project_id,)).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item["reasons"] = json.loads(item.pop("reasons_json"))
        items.append(item)
    return {"candidates": items}


def run_render_job(job_id: str, project_id: str, candidate_id: str, source_path: str, candidate: dict[str, Any], settings: dict[str, Any]) -> None:
    from pipeline import render
    try:
        update_job(job_id, "running", 10, "Clip wird gerendert")
        output_dir = DATA_DIR / "exports" / project_id
        output_dir.mkdir(parents=True, exist_ok=True)
        export_id = str(uuid.uuid4())
        output = output_dir / f"{export_id}.mp4"
        result = render(Path(source_path), output, candidate["start_seconds"], candidate["end_seconds"], settings["aspect_ratio"], settings["quality"], settings.get("framing", "crop"))
        result_payload = {"export_id": export_id, **result}
        with connect() as db:
            db.execute("INSERT INTO exports(id,project_id,candidate_id,path,duration_seconds,aspect_ratio,resolution,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                       (export_id, project_id, candidate_id, result["path"], result["duration_seconds"], result["aspect_ratio"], result["resolution"], result["size_bytes"], now_iso()))
            db.execute("UPDATE jobs SET status='completed',progress=100,stage='Export abgeschlossen',error=NULL,result_json=?,updated_at=? WHERE id=?",
                       (json.dumps(result_payload), now_iso(), job_id))
    except Exception as exc:
        update_job(job_id, "failed", 100, "Export fehlgeschlagen", error=str(exc)[:2000])


@app.post("/api/projects/{project_id}/candidates/{candidate_id}/render")
def start_render(project_id: str, candidate_id: str, payload: RenderInput, x_clipper_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_clipper_token)
    with connect() as db:
        row = db.execute("SELECT c.*,a.path FROM candidates c JOIN assets a ON a.id=c.asset_id WHERE c.id=? AND c.project_id=?", (candidate_id, project_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Clip candidate not found")
        job_id = str(uuid.uuid4())
        stamp = now_iso()
        candidate = {"start_seconds": row["start_seconds"], "end_seconds": row["end_seconds"]}
        job_payload = {"candidate_id": candidate_id, "source_path": row["path"], "candidate": candidate, "settings": payload.model_dump()}
        db.execute("INSERT INTO jobs(id,project_id,kind,status,progress,stage,payload_json,created_at,updated_at) VALUES(?,?,?,'queued',0,'Warteschlange',?,?,?)",
                   (job_id, project_id, "render", json.dumps(job_payload), stamp, stamp))
    return {"job_id": job_id, "status": "queued"}

class BatchRenderInput(RenderInput):
    candidate_ids: list[str] = Field(min_length=1, max_length=50)


def run_batch_render_job(job_id: str, project_id: str, items: list[dict[str, Any]], settings: dict[str, Any]) -> None:
    from pipeline import render
    export_ids: list[str] = []
    try:
        total = len(items)
        output_dir = DATA_DIR / "exports" / project_id
        output_dir.mkdir(parents=True, exist_ok=True)
        for index, item in enumerate(items, start=1):
            update_job(job_id, "running", int((index - 1) * 100 / total), f"Rendere Clip {index}/{total}")
            export_id = str(uuid.uuid4())
            output = output_dir / f"{export_id}.mp4"
            result = render(
                Path(item["source_path"]), output,
                item["start_seconds"], item["end_seconds"],
                settings["aspect_ratio"], settings["quality"], settings.get("framing", "crop"),
            )
            with connect() as db:
                db.execute(
                    "INSERT INTO exports(id,project_id,candidate_id,path,duration_seconds,aspect_ratio,resolution,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                    (export_id, project_id, item["candidate_id"], result["path"],
                     result["duration_seconds"], result["aspect_ratio"], result["resolution"],
                     result["size_bytes"], now_iso()),
                )
            export_ids.append(export_id)
        update_job(job_id, "completed", 100, f"{total} Clips exportiert",
                   result={"export_ids": export_ids, "export_count": len(export_ids)})
    except Exception as exc:
        update_job(job_id, "failed", 100, "Batch-Export fehlgeschlagen",
                   error=f"{str(exc)[:1800]} | Bereits exportiert: {len(export_ids)}/{len(items)}",
                   result={"export_ids": export_ids, "export_count": len(export_ids)})


@app.post("/api/projects/{project_id}/render-batch")
def start_batch_render(project_id: str, payload: BatchRenderInput, x_clipper_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_clipper_token)
    ids = list(dict.fromkeys(payload.candidate_ids))
    if len(ids) != len(payload.candidate_ids):
        raise HTTPException(status_code=422, detail="Duplicate candidate IDs are not allowed")
    with connect() as db:
        rows = db.execute(
            f"SELECT c.id,c.start_seconds,c.end_seconds,a.path FROM candidates c JOIN assets a ON a.id=c.asset_id WHERE c.project_id=? AND c.id IN ({','.join('?' for _ in ids)})",
            (project_id, *ids),
        ).fetchall()
        if len(rows) != len(ids):
            raise HTTPException(status_code=404, detail="One or more clip candidates were not found in this project")
        by_id = {row["id"]: row for row in rows}
        items = [{"candidate_id": candidate_id, "start_seconds": by_id[candidate_id]["start_seconds"],
                  "end_seconds": by_id[candidate_id]["end_seconds"], "source_path": by_id[candidate_id]["path"]}
                 for candidate_id in ids]
        job_id = str(uuid.uuid4())
        stamp = now_iso()
        job_payload = {"items": items, "settings": {"aspect_ratio": payload.aspect_ratio, "quality": payload.quality, "framing": payload.framing}}
        db.execute(
            "INSERT INTO jobs(id,project_id,kind,status,progress,stage,payload_json,created_at,updated_at) VALUES(?,?,?,'queued',0,'Warteschlange',?,?,?)",
            (job_id, project_id, "batch_render", json.dumps(job_payload), stamp, stamp),
        )
    return {"job_id": job_id, "status": "queued", "clip_count": len(ids)}


@app.get("/api/exports/{export_id}/download")
def download_export(export_id: str, x_clipper_token: str | None = Header(default=None)):
    require_token(x_clipper_token)
    with connect() as db:
        row = db.execute("SELECT * FROM exports WHERE id=?", (export_id,)).fetchone()
    if not row or not Path(row["path"]).is_file():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(row["path"], media_type="video/mp4", filename=f"clip-{export_id[:8]}.mp4")


@app.get("/api/projects/{project_id}/exports")
def list_exports(project_id: str, x_clipper_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_clipper_token)
    with connect() as db:
        rows = db.execute("SELECT id,candidate_id,duration_seconds,aspect_ratio,resolution,size_bytes,created_at FROM exports WHERE project_id=? ORDER BY created_at DESC", (project_id,)).fetchall()
    return {"exports": [dict(row) for row in rows]}
