import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


def setup_db(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "queue.sqlite3")
    monkeypatch.setattr(main, "MEDIA_DIR", tmp_path / "media")
    main.init_db()
    with main.connect() as db:
        db.execute(
            "INSERT INTO projects(id,title,mode,created_at,updated_at) VALUES(?,?,?,?,?)",
            ("project-1", "Queue test", "clipper", "2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"),
        )


def insert_job(job_id, status="queued", payload=None):
    with main.connect() as db:
        db.execute(
            """INSERT INTO jobs(id,project_id,kind,status,progress,stage,payload_json,created_at,updated_at)
               VALUES(?,?,? ,?,0,'Warteschlange',?,?,?)""",
            (job_id, "project-1", "analysis", status,
             json.dumps(payload) if payload is not None else None,
             "2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"),
        )


def test_claim_next_job_is_atomic_and_returns_persisted_payload(tmp_path, monkeypatch):
    setup_db(tmp_path, monkeypatch)
    payload = {"asset_id": "asset-1", "source_path": "/media/source.mp4", "settings": {"clip_seconds": 30}}
    insert_job("job-1", payload=payload)

    claimed = main.claim_next_job('worker-a')

    assert claimed["id"] == "job-1"
    assert claimed["status"] == "running"
    assert json.loads(claimed["payload_json"]) == payload
    assert main.claim_next_job('worker-b') is None


def test_restart_recovery_requeues_running_jobs_and_fails_legacy_jobs(tmp_path, monkeypatch):
    setup_db(tmp_path, monkeypatch)
    insert_job("recoverable", status="running", payload={"kind": "analysis"})
    insert_job("legacy", status="running", payload=None)
    insert_job("waiting", status="queued", payload={"kind": "render"})

    main.recover_interrupted_jobs()

    with main.connect() as db:
        rows = {row["id"]: dict(row) for row in db.execute("SELECT * FROM jobs")}
    assert rows["recoverable"]["status"] == "queued"
    assert rows["recoverable"]["progress"] == 0
    assert rows["waiting"]["status"] == "queued"
    assert rows["legacy"]["status"] == "failed"
    assert "keine gespeicherten Auftragsdaten" in rows["legacy"]["error"]


def test_schema_migration_adds_payload_column_to_existing_database(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "legacy.sqlite3")
    with main.connect() as db:
        db.execute(
            """CREATE TABLE jobs (
              id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
              status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
              stage TEXT NOT NULL, error TEXT, result_json TEXT,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )"""
        )

    main.init_db()

    with main.connect() as db:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(jobs)")}
    assert "payload_json" in columns



def test_active_lease_is_not_recovered_and_heartbeat_renews_it(tmp_path, monkeypatch):
    setup_db(tmp_path, monkeypatch)
    insert_job("active", status="running", payload={"kind": "analysis"})
    with main.connect() as db:
        db.execute(
            "UPDATE jobs SET lease_owner=?,lease_expires_at=? WHERE id=?",
            ("worker-a", "2999-01-01T00:00:00+00:00", "active"),
        )

    main.recover_interrupted_jobs()
    assert main.heartbeat_job("active", "worker-a") is True
    with main.connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id='active'").fetchone()
    assert row["status"] == "running"
    assert row["lease_owner"] == "worker-a"
    assert row["lease_expires_at"] > main.now_iso()


def test_expired_lease_is_requeued_then_fails_at_attempt_limit(tmp_path, monkeypatch):
    setup_db(tmp_path, monkeypatch)
    insert_job("retry", status="running", payload={"kind": "analysis"})
    insert_job("exhausted", status="running", payload={"kind": "render"})
    with main.connect() as db:
        db.execute(
            "UPDATE jobs SET lease_owner='dead-worker',lease_expires_at='2000-01-01T00:00:00+00:00',attempt_count=1 WHERE id='retry'"
        )
        db.execute(
            "UPDATE jobs SET lease_owner='dead-worker',lease_expires_at='2000-01-01T00:00:00+00:00',attempt_count=3,max_attempts=3 WHERE id='exhausted'"
        )

    main.recover_interrupted_jobs()
    with main.connect() as db:
        rows = {row["id"]: dict(row) for row in db.execute("SELECT * FROM jobs")}
    assert rows["retry"]["status"] == "queued"
    assert rows["retry"]["lease_owner"] is None
    assert rows["exhausted"]["status"] == "failed"
    assert "Wiederherstellungsversuchen" in rows["exhausted"]["error"]


def test_lease_columns_are_migrated_on_existing_database(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "old_queue.sqlite3")
    with main.connect() as db:
        db.execute(
            """CREATE TABLE jobs (
              id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
              status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
              stage TEXT NOT NULL, error TEXT, result_json TEXT,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )"""
        )
    main.init_db()
    with main.connect() as db:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(jobs)")}
    assert {"payload_json", "lease_owner", "lease_expires_at", "attempt_count", "max_attempts"}.issubset(columns)



def test_orphan_cleanup_removes_only_old_terminal_workdirs(tmp_path, monkeypatch):
    setup_db(tmp_path, monkeypatch)
    work = tmp_path / "work"
    work.mkdir()
    terminal = work / "done-job"
    active = work / "active-job"
    missing = work / "missing-job"
    for folder in (terminal, active, missing):
        folder.mkdir()
        (folder / "artifact.tmp").write_text("temporary")
    insert_job("done-job", status="completed", payload={"kind": "analysis"})
    insert_job("active-job", status="running", payload={"kind": "analysis"})
    import os, time
    old = time.time() - 48 * 3600
    for folder in (terminal, active, missing):
        os.utime(folder, (old, old))

    removed = main.cleanup_orphan_workdirs(min_age_hours=24)

    assert removed == 2
    assert not terminal.exists()
    assert active.exists()
    assert not missing.exists()


def test_batch_render_job_exports_each_candidate_and_completes(tmp_path, monkeypatch):
    setup_db(tmp_path, monkeypatch)
    import pipeline
    with main.connect() as db:
        db.execute(
            "INSERT INTO jobs(id,project_id,kind,status,progress,stage,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ("batch-1", "project-1", "batch_render", "running", 1, "Worker", "{}", main.now_iso(), main.now_iso()),
        )
    def fake_render(source, output, start, end, aspect, quality):
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(b"mock-video")
        return {"path": str(output), "duration_seconds": end-start, "aspect_ratio": aspect,
                "resolution": "1080x1920", "size_bytes": output.stat().st_size}
    monkeypatch.setattr(pipeline, "render", fake_render)
    items = [
        {"candidate_id": "candidate-a", "source_path": "source.mp4", "start_seconds": 0, "end_seconds": 20},
        {"candidate_id": "candidate-b", "source_path": "source.mp4", "start_seconds": 30, "end_seconds": 50},
    ]

    main.run_batch_render_job("batch-1", "project-1", items, {"aspect_ratio": "9:16", "quality": 1080})

    with main.connect() as db:
        job = db.execute("SELECT * FROM jobs WHERE id='batch-1'").fetchone()
        exports = db.execute("SELECT * FROM exports WHERE project_id='project-1'").fetchall()
    assert job["status"] == "completed"
    assert job["progress"] == 100
    assert len(exports) == 2
    assert json.loads(job["result_json"])["export_count"] == 2
